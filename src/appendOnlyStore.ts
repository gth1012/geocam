/**
 * Append-Only 로컬 저장 체인 모듈
 * Phase 2-A / Step 5
 * 
 * 레코드 구조 (LOCK):
 * - recordId (uuid)
 * - createdAt (ISO string)
 * - packCanonical (string)
 * - packHash (sha256 hex)
 * - signatureBase64
 * - keyId
 * - prevRecordHash (null if first)
 * - recordHash (sha256 hex)
 * 
 * recordHash = sha256(prevRecordHash + "." + packHash + "." + signatureBase64)
 */

const STORE_KEY = 'geocam_evidence_chain';

export interface EvidenceRecord {
  recordId: string;
  createdAt: string;
  packCanonical: string;
  packHash: string;
  signatureBase64: string;
  keyId: string;
  prevRecordHash: string | null;
  recordHash: string;
}

interface AppendResult {
  ok: true;
  recordId: string;
}

interface ValidateResult {
  ok: boolean;
  brokenAt?: string;
}

// UUID 생성
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// SHA256 해시 (동기, 브라우저용)
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 체인 로드
function loadChain(): EvidenceRecord[] {
  const stored = localStorage.getItem(STORE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

// 체인 저장
function saveChain(chain: EvidenceRecord[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(chain));
}

/**
 * 레코드 추가 (Append-Only)
 */
export async function appendRecord(
  packCanonical: string,
  packHash: string,
  signatureBase64: string,
  keyId: string
): Promise<AppendResult> {
  const chain = loadChain();
  
  // 이전 레코드 해시
  const prevRecordHash = chain.length > 0 
    ? chain[chain.length - 1].recordHash 
    : null;

  // recordHash 계산
  const hashInput = (prevRecordHash || 'null') + '.' + packHash + '.' + signatureBase64;
  const recordHash = await sha256(hashInput);

  const record: EvidenceRecord = {
    recordId: generateUuid(),
    createdAt: new Date().toISOString(),
    packCanonical,
    packHash,
    signatureBase64,
    keyId,
    prevRecordHash,
    recordHash
  };

  // Append only
  chain.push(record);
  saveChain(chain);

  return {
    ok: true,
    recordId: record.recordId
  };
}

/**
 * 체인 무결성 검증
 */
export async function validateChain(): Promise<ValidateResult> {
  const chain = loadChain();

  if (chain.length === 0) {
    return { ok: true };
  }

  for (let i = 0; i < chain.length; i++) {
    const record = chain[i];

    // prevRecordHash 검증
    const expectedPrev = i === 0 ? null : chain[i - 1].recordHash;
    if (record.prevRecordHash !== expectedPrev) {
      return { ok: false, brokenAt: record.recordId };
    }

    // recordHash 검증
    const hashInput = (record.prevRecordHash || 'null') + '.' + record.packHash + '.' + record.signatureBase64;
    const expectedHash = await sha256(hashInput);
    if (record.recordHash !== expectedHash) {
      return { ok: false, brokenAt: record.recordId };
    }
  }

  return { ok: true };
}

/**
 * 체인 조회 (읽기 전용)
 */
export function getChain(): EvidenceRecord[] {
  return loadChain();
}

/**
 * 체인 길이
 */
export function getChainLength(): number {
  return loadChain().length;
}
