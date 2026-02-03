/**
 * Ed25519 서명 모듈 (tweetnacl 기반)
 * Write-Gate A 서버 연동 + Evidence Pack 서명
 *
 * 1. ensureDeviceKeypair() -> { keyId, publicKeyHex }
 * 2. signForGateA(nonce, dinaId, timestamp) -> { signature, public_key, client_timestamp }
 * 3. signPack(canonicalString) -> { signatureBase64, keyId }
 */

import nacl from 'tweetnacl';

const KEYPAIR_STORAGE_KEY = 'geocam_device_keypair_v2';

// Ed25519 SPKI DER 헤더 (12바이트): SEQUENCE(42) > SEQUENCE(5) > OID(1.3.101.112) > BITSTRING(33)
const SPKI_DER_PREFIX = '302a300506032b6570032100';

interface DeviceKeypair {
  keyId: string;
  publicKeyHex: string;     // raw 32바이트 hex
  secretKeyHex: string;     // 64바이트 hex (tweetnacl secretKey)
}

export interface KeypairInfo {
  keyId: string;
  publicKeyHex: string;
}

export interface GateASignature {
  signature: string;        // hex: 64바이트 Ed25519 서명
  public_key: string;       // hex: SPKI DER 포맷 공개키 (서버 호환)
  client_timestamp: number; // ms
}

interface SignResult {
  signatureBase64: string;
  keyId: string;
}

// ─── 유틸리티 ───

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function generateKeyId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'KEY-';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ─── 키페어 관리 ───

/**
 * 기기 키페어 확보 (최초 실행 시 생성, 이후 localStorage에서 로드)
 */
export async function ensureDeviceKeypair(): Promise<KeypairInfo> {
  const stored = localStorage.getItem(KEYPAIR_STORAGE_KEY);
  if (stored) {
    try {
      const keypair: DeviceKeypair = JSON.parse(stored);
      if (keypair.publicKeyHex && keypair.secretKeyHex) {
        return { keyId: keypair.keyId, publicKeyHex: keypair.publicKeyHex };
      }
    } catch {
      // 파싱 실패 시 재생성
    }
  }

  // tweetnacl Ed25519 키페어 생성
  const keyPair = nacl.sign.keyPair();

  const newKeypair: DeviceKeypair = {
    keyId: generateKeyId(),
    publicKeyHex: bytesToHex(keyPair.publicKey),     // 32바이트
    secretKeyHex: bytesToHex(keyPair.secretKey),      // 64바이트
  };

  localStorage.setItem(KEYPAIR_STORAGE_KEY, JSON.stringify(newKeypair));
  console.log('[Ed25519] New keypair generated:', newKeypair.keyId);

  return { keyId: newKeypair.keyId, publicKeyHex: newKeypair.publicKeyHex };
}

/**
 * 저장된 secretKey 로드
 */
function loadSecretKey(): Uint8Array {
  const stored = localStorage.getItem(KEYPAIR_STORAGE_KEY);
  if (!stored) throw new Error('KEYPAIR_NOT_FOUND');
  const keypair: DeviceKeypair = JSON.parse(stored);
  return hexToBytes(keypair.secretKeyHex);
}

// ─── Write-Gate A: 서버 인증용 서명 ───

/**
 * Gate A 서명 생성
 * sign(nonce + dina_id + timestamp) → { signature(hex), public_key(SPKI DER hex), client_timestamp }
 */
export async function signForGateA(nonce: string, dinaId: string): Promise<GateASignature> {
  const keypairInfo = await ensureDeviceKeypair();
  const secretKey = loadSecretKey();

  const timestamp = Date.now();
  const message = nonce + dinaId + timestamp;
  const messageBytes = new TextEncoder().encode(message);

  // Ed25519 서명 (detached: 메시지 없이 서명만)
  const signatureBytes = nacl.sign.detached(messageBytes, secretKey);

  // 공개키를 SPKI DER 포맷으로 변환 (서버의 createPublicKey 호환)
  const publicKeySpkiHex = SPKI_DER_PREFIX + keypairInfo.publicKeyHex;

  console.log('[Ed25519] Gate A signature created | keyId:', keypairInfo.keyId, '| ts:', timestamp);

  return {
    signature: bytesToHex(signatureBytes),
    public_key: publicKeySpkiHex,
    client_timestamp: timestamp,
  };
}

// ─── Evidence Pack 서명 (기존 호환) ───

/**
 * Evidence Pack 서명 (Base64 출력 — 로컬 무결성용)
 */
export async function signPack(canonicalString: string): Promise<SignResult> {
  const stored = localStorage.getItem(KEYPAIR_STORAGE_KEY);
  if (!stored) throw new Error('KEYPAIR_NOT_FOUND');

  const keypair: DeviceKeypair = JSON.parse(stored);
  const secretKey = hexToBytes(keypair.secretKeyHex);
  const messageBytes = new TextEncoder().encode(canonicalString);
  const signatureBytes = nacl.sign.detached(messageBytes, secretKey);

  return {
    signatureBase64: bytesToBase64(signatureBytes),
    keyId: keypair.keyId,
  };
}

/**
 * Evidence Pack 서명 검증
 */
export function verifyPack(
  canonicalString: string,
  signatureBase64: string,
  publicKeyHex: string,
): boolean {
  try {
    const messageBytes = new TextEncoder().encode(canonicalString);
    const sigBinary = atob(signatureBase64);
    const sigBytes = new Uint8Array(sigBinary.length);
    for (let i = 0; i < sigBinary.length; i++) {
      sigBytes[i] = sigBinary.charCodeAt(i);
    }
    const pubKeyBytes = hexToBytes(publicKeyHex);
    return nacl.sign.detached.verify(messageBytes, sigBytes, pubKeyBytes);
  } catch {
    return false;
  }
}
