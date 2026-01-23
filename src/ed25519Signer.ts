/**
 * Ed25519 서명 모듈
 * Phase 2-A / Step 4
 * 
 * 1. ensureDeviceKeypair() -> { keyId, publicKeyBase64 }
 * 2. signPack(canonicalString) -> { signatureBase64, keyId }
 * 3. verifyPack(canonicalString, signatureBase64, publicKeyBase64) -> boolean
 */

// 키 저장소 (로컬 스토리지 최소 구현)
const KEYPAIR_STORAGE_KEY = 'geocam_device_keypair';

interface DeviceKeypair {
  keyId: string;
  publicKeyBase64: string;
  privateKeyBase64: string;
}

interface KeypairInfo {
  keyId: string;
  publicKeyBase64: string;
}

interface SignResult {
  signatureBase64: string;
  keyId: string;
}

// 랜덤 keyId 생성
function generateKeyId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'KEY-';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Base64 인코딩/디코딩
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 기기 키페어 확보
 * 없으면 생성, 있으면 반환
 */
export async function ensureDeviceKeypair(): Promise<KeypairInfo> {
  // 기존 키페어 확인
  const stored = localStorage.getItem(KEYPAIR_STORAGE_KEY);
  if (stored) {
    const keypair: DeviceKeypair = JSON.parse(stored);
    return {
      keyId: keypair.keyId,
      publicKeyBase64: keypair.publicKeyBase64
    };
  }

  // 새 키페어 생성 (Ed25519)
  const keyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  );

  // 키 내보내기
  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const privateKeyPkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  const newKeypair: DeviceKeypair = {
    keyId: generateKeyId(),
    publicKeyBase64: arrayBufferToBase64(publicKeyRaw),
    privateKeyBase64: arrayBufferToBase64(privateKeyPkcs8)
  };

  // 저장
  localStorage.setItem(KEYPAIR_STORAGE_KEY, JSON.stringify(newKeypair));

  return {
    keyId: newKeypair.keyId,
    publicKeyBase64: newKeypair.publicKeyBase64
  };
}

/**
 * Pack 서명
 */
export async function signPack(canonicalString: string): Promise<SignResult> {
  const stored = localStorage.getItem(KEYPAIR_STORAGE_KEY);
  if (!stored) {
    throw new Error('KEYPAIR_NOT_FOUND');
  }

  const keypair: DeviceKeypair = JSON.parse(stored);

  // Private key 복원
  const privateKeyBuffer = base64ToArrayBuffer(keypair.privateKeyBase64);
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  // 서명
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalString);
  const signature = await crypto.subtle.sign('Ed25519', privateKey, data);

  return {
    signatureBase64: arrayBufferToBase64(signature),
    keyId: keypair.keyId
  };
}

/**
 * Pack 서명 검증
 */
export async function verifyPack(
  canonicalString: string,
  signatureBase64: string,
  publicKeyBase64: string
): Promise<boolean> {
  try {
    // Public key 복원
    const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64);
    const publicKey = await crypto.subtle.importKey(
      'raw',
      publicKeyBuffer,
      { name: 'Ed25519' },
      false,
      ['verify']
    );

    // 검증
    const encoder = new TextEncoder();
    const data = encoder.encode(canonicalString);
    const signature = base64ToArrayBuffer(signatureBase64);

    return await crypto.subtle.verify('Ed25519', publicKey, signature, data);
  } catch {
    return false;
  }
}
