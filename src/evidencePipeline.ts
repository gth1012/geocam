/**
 * Evidence Pipeline (E2E Orchestrator)
 * Phase 2-A / Step 6
 * 서버 API 연동 버전
 *
 * W2 정정 (2026-04-27, P0-5 LT-ENGINE v0.2 § 4 + AUDIT-001 v1.1 § 5-1 + 빅보스 D1 LOCK):
 * - 로컬 ONNX AI (geocodeEngine) 완전 제거
 *   * 로컬 AI import 제거
 *   * Step 2 로컬 ONNX 호출 블록 삭제
 *   * Step 5 fallback 판정 삭제 (서버 실패 = INSUFFICIENT_DATA)
 *   * Step 6 evidencePack 로컬 AI 필드 제거
 *   * 이미지 유사도 점수 필드 제거 (GC-SPEC-013 v0.5 § 1.5 위반)
 *   * 클라이언트 confidence 파라미터 제거
 * - PipelineOutput.verify_status 4-state → 3-state (PRESENT/ABSENT/INSUFFICIENT_DATA)
 * - ServerVerifyResult.status 3-state 정합
 * - 서버 단독 검증 (NeoSystem 범위 = 코드 검증만, 학습 LOCK 8 정합)
 */
import { parseQr, isError, isMissing } from './qrParser';
import { canonicalizePack } from './packCanonical';
import { ensureDeviceKeypair, signPack, verifyPack, signForGateA } from './ed25519Signer';
import { buildGateBPayload } from './deviceGateB';
import { buildGateCPayload } from './deviceGateC';
import { API_BASE_URL } from './api/client';

// W2 정정: 3-state 타입 (LT-ENGINE v0.2 § 3.1 LOCK + AUDIT D2)
export type VerifyStatusV2 = 'PRESENT' | 'ABSENT' | 'INSUFFICIENT_DATA';

export interface PipelineInput {
  qrRaw: string | null;
  imageUri: string;
  geoBucket?: string | null;
  deviceFingerprintHash: string;
}

export interface PipelineOutput {
  ok: boolean;
  recordId?: string;
  packHash?: string;
  error?: string;
  error_code?: string;
  qr_status?: 'found' | 'missing' | 'invalid';
  verify_status?: VerifyStatusV2;     // W2 정정: 3-state
  confidence?: number | null;
  // 이미지 유사도 점수 필드 제거 (W2 정정 - GC-SPEC-013 v0.5 § 1.5 위반)
  sessionToken?: string;
  nonce?: string;
  dinaId?: string;
  signatureVerified?: boolean;
}

function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 이미지 URI를 Base64로 변환
 */
async function imageUriToBase64(imageUri: string): Promise<string> {
  try {
    // data:image/... Base64 URI인 경우 prefix 제거
    if (imageUri.startsWith('data:image')) {
      return imageUri.replace(/^data:image\/\w+;base64,/, '');
    }

    // blob:, http(s):// 또는 file:// URL인 경우 fetch로 가져오기
    const response = await fetch(imageUri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).replace(/^data:image\/\w+;base64,/, '');
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('[imageUriToBase64] Error:', err);
    throw new Error('IMAGE_CONVERT_FAILED: ' + (err instanceof Error ? err.message : String(err)));
  }
}

/**
 * W2 정정: ServerVerifyResult.status 3-state 정합
 * NeoStudio toScanResultV2 응답 = 'PRESENT' | 'ABSENT' | 'INSUFFICIENT_DATA' (3-state)
 * 호환성: result_legacy 필드 (구 4-state) 추가 보존, 단 status는 3-state 우선
 */
export interface ServerVerifyResult {
  success: boolean;
  isAuthentic: boolean;
  status: VerifyStatusV2 | 'ERROR' | 'ACTIVATED' | 'SHIPPED';
  confidence?: number;
  // 이미지 유사도 점수 필드 제거 (W2 정정)
  sessionToken?: string;
  nonce?: string;
  dinaId?: string;
  assetInfo?: {
    dina_id: string;
    series_name: string;
    batch_id: string;
    created_at: string;
  };
  is_conflict?: boolean;       // W2 신규: NeoStudio toScanResultV2 is_conflict 보존
  reason_code?: string;        // W2 신규: NeoStudio reason_code 보존
  error?: string;
  error_code?: string;
  httpStatus?: number;
}

/**
 * QR 스캔 후 자산 상태만 확인 (이미지 없이 scan/start만 호출)
 * App.tsx의 Scan 화면에서 사용
 */
export async function checkAssetStatus(
  dinaCode: string,
  deviceId: string
): Promise<ServerVerifyResult> {
  try {
    console.log('[checkAssetStatus] Checking:', dinaCode);

    const startRes = await fetch(API_BASE_URL + '/geocam/scan/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qr_payload: dinaCode,
        device_id: deviceId,
      })
    });

    const startData = await startRes.json();
    console.log('[checkAssetStatus] Response:', startData.success, startData.asset_status);

    if (!startData.success) {
      return {
        success: false,
        isAuthentic: false,
        status: 'INSUFFICIENT_DATA',
        error: startData.error || 'SCAN_START_FAILED',
        error_code: startData.error,
      };
    }

    // 자산 상태에 따라 결과 반환
    const assetStatus = startData.asset_status;
    return {
      success: true,
      isAuthentic: assetStatus === 'SHIPPED' || assetStatus === 'ACTIVATED',
      status: assetStatus || 'INSUFFICIENT_DATA',
      sessionToken: startData.session_token,
      dinaId: startData.asset_info?.dina_id,
      assetInfo: startData.asset_info,
    };
  } catch (err) {
    console.error('[checkAssetStatus] Error:', err);
    const httpStatus = (err as any)?.status || 0;
    let errorCode = err instanceof Error ? err.message : String(err);
    if (httpStatus === 429) errorCode = 'RATE_LIMIT_EXCEEDED';
    return {
      success: false,
      isAuthentic: false,
      status: 'ERROR',
      error: errorCode,
      error_code: errorCode,
      httpStatus,
    };
  }
}

/**
 * 서버 API를 통한 검증 (scan/start → verify)
 *
 * W2 정정: 클라이언트 confidence 파라미터 제거 (D1 LOCK)
 *   - 클라이언트 단독 판정 권한 박탈 (학습 LOCK 4 + AUDIT D1)
 *   - 서버 단독 검증 (NeoStudio toScanResultV2 결과만 사용)
 */
export async function verifyWithServer(
  dinaCode: string,
  deviceId: string,
  imageData: string
): Promise<ServerVerifyResult> {
  try {
    console.log('[verifyWithServer] Starting scan for:', dinaCode);

    // Step 1: scan/start - 세션 발급
    const startRes = await fetch(API_BASE_URL + '/geocam/scan/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qr_payload: dinaCode,
        device_id: deviceId,
      })
    });

    const startData = await startRes.json();
    console.log('[verifyWithServer] scan/start response:', startData.success, startData.asset_status);

    if (!startData.success) {
      return {
        success: false,
        isAuthentic: false,
        status: 'INSUFFICIENT_DATA',
        error: startData.error || 'SCAN_START_FAILED'
      };
    }

    // Step 2: Gate A 서명 생성 (nonce + dina_id + timestamp)
    const dinaId = startData.asset_info?.dina_id || dinaCode;
    let gateA: { signature: string; public_key: string; client_timestamp: number } | null = null;
    try {
      gateA = await signForGateA(startData.nonce, dinaId);
      console.log('[verifyWithServer] Gate A signature created, ts:', gateA.client_timestamp);
    } catch (e) {
      console.warn('[verifyWithServer] Gate A signature failed:', e);
    }

    // Step 3: Gate B 디바이스 검증 페이로드 생성
    let gateB: { device_info: { platform: string; model: string; os_version: string }; app_attestation: string } | null = null;
    try {
      gateB = await buildGateBPayload();
      console.log('[verifyWithServer] Gate B payload ready, platform:', gateB.device_info.platform);
    } catch (e) {
      console.warn('[verifyWithServer] Gate B payload failed:', e);
    }

    // Step 3.5: Gate C GPS 위치 수집 (실패 시 null → verify 계속 진행)
    let gateC: { gps: { latitude: number; longitude: number; accuracy?: number }; client_timestamp: number } | null = null;
    try {
      gateC = await buildGateCPayload();
      if (gateC) {
        console.log('[verifyWithServer] Gate C GPS:', gateC.gps.latitude, gateC.gps.longitude);
      }
    } catch (e) {
      console.warn('[verifyWithServer] Gate C GPS failed:', e);
    }

    // Step 4: verify - 이미지 검증 (Gate A + B + C 포함)
    // W2 정정: 클라이언트 confidence 제거 (D1 LOCK)
    const verifyRes = await fetch(API_BASE_URL + '/geocam/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_token: startData.session_token,
        nonce: startData.nonce,
        image_data: imageData,
        device_info: gateB?.device_info || {
          platform: 'web',
          model: navigator.platform || 'Unknown',
          os_version: navigator.userAgent.substring(0, 50),
        },
        app_attestation: gateB?.app_attestation,
        // Gate A: Ed25519 서명
        ...(gateA && {
          signature: gateA.signature,
          public_key: gateA.public_key,
          client_timestamp: gateA.client_timestamp,
        }),
        // Gate C: GPS 위치
        ...(gateC && { gps: gateC.gps }),
      })
    });

    const verifyData = await verifyRes.json();
    console.log('[verifyWithServer] verify response:', verifyData.success, verifyData.result, verifyData.confidence, 'trust:', verifyData.trust_level);

    // WRITE_GATE_FAILED 감지: trust_level이 L1이고 gate_results에 실패 항목 존재
    let resolvedErrorCode = verifyData.error || undefined;
    if (verifyData.trust_level === 'L1_OBSERVATION' && verifyData.gate_results) {
      const failedGates = verifyData.gate_results.filter((g: any) => !g.passed);
      if (failedGates.length > 0) {
        resolvedErrorCode = resolvedErrorCode || 'WRITE_GATE_FAILED';
        console.warn('[verifyWithServer] Gate failures:', failedGates.map((g: any) => g.gate + ':' + g.reason).join(', '));
      }
    }

    // W2 정정: NeoStudio toScanResultV2 응답 (result = 3-state)
    return {
      success: verifyData.success,
      isAuthentic: verifyData.result === 'PRESENT',
      status: verifyData.result || 'INSUFFICIENT_DATA',
      confidence: verifyData.confidence,
      sessionToken: startData.session_token,
      nonce: startData.nonce,
      dinaId: verifyData.matched_dina_id || startData.asset_info?.dina_id,
      assetInfo: startData.asset_info,
      is_conflict: verifyData.is_conflict,
      reason_code: verifyData.reason_code,
      error: verifyData.error,
      error_code: resolvedErrorCode,
    };
  } catch (err) {
    console.error('[verifyWithServer] Error:', err);
    // HTTP 상태 코드 감지 (Capacitor Http 응답)
    const httpStatus = (err as any)?.status || 0;
    let errorCode = err instanceof Error ? err.message : String(err);
    if (httpStatus === 429) errorCode = 'RATE_LIMIT_EXCEEDED';
    return {
      success: false,
      isAuthentic: false,
      status: 'ERROR',
      error: errorCode,
      error_code: errorCode,
      httpStatus,
    };
  }
}

/**
 * 서버에 정품 등록 요청 (register) — Gate A+B+C 포함
 */
export async function registerWithServer(
  sessionToken: string,
  dinaId: string,
  nonce: string
): Promise<{ success: boolean; status: string; error?: string; error_code?: string }> {
  try {
    // Gate A: Ed25519 서명
    let gateAData: Record<string, unknown> = {};
    try {
      const gateA = await signForGateA(nonce, dinaId);
      gateAData = { signature: gateA.signature, public_key: gateA.public_key, client_timestamp: gateA.client_timestamp };
    } catch (e) {
      console.warn('[registerWithServer] Gate A failed:', e);
    }

    // Gate B: 디바이스 검증
    let gateBData: Record<string, unknown> = {};
    try {
      const gateB = await buildGateBPayload();
      gateBData = { device_info: gateB.device_info, app_attestation: gateB.app_attestation };
    } catch (e) {
      console.warn('[registerWithServer] Gate B failed:', e);
    }

    // Gate C: GPS
    let gateCData: Record<string, unknown> = {};
    try {
      const gateC = await buildGateCPayload();
      if (gateC) gateCData = { gps: gateC.gps };
    } catch (e) {
      console.warn('[registerWithServer] Gate C failed:', e);
    }

    const res = await fetch(API_BASE_URL + '/geocam/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_token: sessionToken,
        nonce: nonce,
        dina_id: dinaId,
        ...gateAData,
        ...gateBData,
        ...gateCData,
      })
    });

    const data = await res.json();
    return {
      success: data.success,
      status: data.status,
      error: data.error,
      error_code: data.error,
    };
  } catch (err) {
    const httpStatus = (err as any)?.status || 0;
    let errorCode = err instanceof Error ? err.message : String(err);
    if (httpStatus === 429) errorCode = 'RATE_LIMIT_EXCEEDED';
    return {
      success: false,
      status: 'ERROR',
      error: errorCode,
      error_code: errorCode,
    };
  }
}

/**
 * Evidence Pipeline 메인 오케스트레이터
 *
 * W2 정정 (D1 LOCK):
 * - Step 2 로컬 AI 호출 제거
 * - Step 5 로컬 AI fallback 제거 (서버 실패 = INSUFFICIENT_DATA)
 * - Step 6 evidencePack.geocode 필드 제거
 * - 이미지 유사도 점수 반환 제거
 */
export async function runEvidencePipeline(input: PipelineInput): Promise<PipelineOutput> {
  try {
    // 1. QR 파싱
    const qrResult = parseQr(input.qrRaw);
    if (isError(qrResult)) {
      return { ok: false, error: 'QR_PARSE_FAILED: ' + qrResult.error, qr_status: 'invalid', verify_status: 'INSUFFICIENT_DATA' };
    }
    const qrStatus = qrResult.status;
    const dinaCode = isMissing(qrResult) ? null : qrResult.dina_code;
    const otp = isMissing(qrResult) ? null : (qrResult.otp || null);
    console.log('[Pipeline] QR:', qrStatus, '| DINA:', dinaCode);

    // W2 정정: Step 2 로컬 AI 엔진 호출 제거 (D1 LOCK)
    //   기존: 로컬 ONNX 모델로 GeoCode 감지 → 클라이언트 confidence 산출
    //   변경: 서버 단독 검증 (NeoSystem 범위 = 코드 검증만)

    // 3. 이미지를 Base64로 변환
    let imageBase64: string | null = null;
    try {
      imageBase64 = await imageUriToBase64(input.imageUri);
      console.log('[Pipeline] Image converted to Base64, length:', imageBase64?.length || 0);
    } catch (imgErr) {
      console.error('[Pipeline] Image conversion failed:', imgErr);
    }

    // 4. 서버 API 검증 (DINA 코드가 있고 이미지 변환 성공 시)
    // W2 정정: 클라이언트 confidence 제거 (D1 LOCK)
    let serverResult: ServerVerifyResult | null = null;
    if (dinaCode && imageBase64) {
      serverResult = await verifyWithServer(
        dinaCode,
        input.deviceFingerprintHash,
        imageBase64
      );
      console.log('[Pipeline] Server verify:', serverResult.status, '| confidence:', serverResult.confidence);
    }

    // 서버 에러코드 전파 (BATCH_NOT_SHIPPED, BATCH_TEMPORARILY_LOCKED, RATE_LIMIT_EXCEEDED 등)
    if (serverResult && !serverResult.success && serverResult.error_code) {
      const code = serverResult.error_code;
      if (code === 'BATCH_NOT_SHIPPED' || code === 'BATCH_TEMPORARILY_LOCKED' || code === 'RATE_LIMIT_EXCEEDED') {
        return {
          ok: false,
          error: code,
          error_code: code,
          verify_status: 'INSUFFICIENT_DATA',
        };
      }
    }

    // 5. W2 정정: 최종 verify_status 결정 (서버 단독 - D1 LOCK)
    //   서버 결과 = NeoStudio toScanResultV2 (PRESENT/ABSENT/INSUFFICIENT_DATA)
    //   서버 실패 시 = INSUFFICIENT_DATA (로컬 AI fallback 제거)
    let verifyStatus: VerifyStatusV2;
    let finalConfidence: number | null = null;

    if (serverResult && serverResult.success) {
      // NeoStudio toScanResultV2 결과 그대로 (3-state)
      const status = serverResult.status;
      if (status === 'PRESENT' || status === 'ABSENT' || status === 'INSUFFICIENT_DATA') {
        verifyStatus = status;
      } else {
        // ACTIVATED/SHIPPED/ERROR 등 → INSUFFICIENT_DATA
        verifyStatus = 'INSUFFICIENT_DATA';
      }
      finalConfidence = serverResult.confidence || null;
    } else {
      // W2 정정: 서버 실패 = INSUFFICIENT_DATA (로컬 AI fallback 제거, D1 LOCK)
      verifyStatus = 'INSUFFICIENT_DATA';
    }

    // 6. W2 정정: Evidence Pack 생성 (geocode 필드 제거)
    const evidencePack = {
      version: '2.0',
      qr_status: qrStatus,
      dinaCode,
      otp,
      imageUri: input.imageUri,
      geoBucket: input.geoBucket || null,
      deviceFingerprintHash: input.deviceFingerprintHash,
      // W2 정정: 로컬 AI 정보 필드 제거 (D1 LOCK)
      server: serverResult ? {
        success: serverResult.success,
        status: serverResult.status,
        confidence: serverResult.confidence,
        dinaId: serverResult.dinaId,
        sessionToken: serverResult.sessionToken,
        is_conflict: serverResult.is_conflict,
        reason_code: serverResult.reason_code,
      } : null,
      timestamp: new Date().toISOString(),
    };

    // 7. Pack 정규화 및 서명
    const packCanonical = canonicalizePack(evidencePack);
    const packHash = await sha256(packCanonical);
    const keypairInfo = await ensureDeviceKeypair();
    const signResult = await signPack(packCanonical);

    // 로컬 서명 검증
    let signatureVerified = false;
    try {
      signatureVerified = verifyPack(packCanonical, signResult.signatureBase64, keypairInfo.publicKeyHex);
    } catch (e) {
      console.warn('[Pipeline] Local signature verification failed:', e);
    }

    const recordId = generateUuid();
    // W2 정정: ok 판정 = PRESENT만 (구 4-state → 신규 'PRESENT'만)
    const isOk = verifyStatus === 'PRESENT';

    return {
      ok: isOk,
      recordId,
      packHash,
      qr_status: qrStatus,
      verify_status: verifyStatus,
      confidence: finalConfidence,
      // 이미지 유사도 점수 필드 제거 (W2 정정)
      error_code: serverResult?.error_code,
      sessionToken: serverResult?.sessionToken,
      nonce: serverResult?.nonce,
      dinaId: serverResult?.dinaId,
      signatureVerified,
    };
  } catch (err) {
    console.error('[Pipeline] Error:', err);
    return {
      ok: false,
      error: 'PIPELINE_ERROR: ' + (err instanceof Error ? err.message : String(err)),
      verify_status: 'INSUFFICIENT_DATA',     // W2 정정: 4-state → 3-state
    };
  }
}
