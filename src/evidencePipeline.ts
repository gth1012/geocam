/**
 * Evidence Pipeline (E2E Orchestrator)
 * Phase 2-A / Step 6
 * 서버 API 연동 버전
 */
import { parseQr, isError, isMissing } from './qrParser';
import { canonicalizePack } from './packCanonical';
import { ensureDeviceKeypair, signPack, signForGateA } from './ed25519Signer';
import { buildGateBPayload } from './deviceGateB';
import { buildGateCPayload } from './deviceGateC';
import { detectGeocode } from './geocodeEngine';
import { Http } from '@capacitor-community/http';

const API_BASE_URL = 'https://geostudio-api-production.up.railway.app';

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
  verify_status?: 'VALID' | 'SUSPECT' | 'UNKNOWN' | 'INVALID';
  confidence?: number | null;
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

export interface ServerVerifyResult {
  success: boolean;
  isAuthentic: boolean;
  status: 'VALID' | 'UNCERTAIN' | 'INVALID' | 'UNKNOWN' | 'ERROR' | 'ACTIVATED' | 'SHIPPED';
  confidence?: number;
  sessionToken?: string;
  dinaId?: string;
  assetInfo?: {
    dina_id: string;
    series_name: string;
    batch_id: string;
    created_at: string;
  };
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

    const startRes = await Http.request({
      method: 'POST',
      url: API_BASE_URL + '/api/geocam/scan/start',
      headers: { 'Content-Type': 'application/json' },
      data: {
        qr_payload: dinaCode,
        device_id: deviceId,
      }
    });

    const startData = startRes.data;
    console.log('[checkAssetStatus] Response:', startData.success, startData.asset_status);

    if (!startData.success) {
      return {
        success: false,
        isAuthentic: false,
        status: 'UNKNOWN',
        error: startData.error || 'SCAN_START_FAILED',
        error_code: startData.error,
      };
    }

    // 자산 상태에 따라 결과 반환
    const assetStatus = startData.asset_status;
    return {
      success: true,
      isAuthentic: assetStatus === 'SHIPPED' || assetStatus === 'ACTIVATED',
      status: assetStatus || 'UNKNOWN',
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
 * @param dinaCode - DINA 코드 (QR에서 추출)
 * @param deviceId - 디바이스 ID
 * @param imageData - Base64 인코딩된 이미지 데이터
 * @param clientConfidence - 클라이언트 측 AI confidence (optional)
 */
export async function verifyWithServer(
  dinaCode: string,
  deviceId: string,
  imageData: string,
  clientConfidence?: number
): Promise<ServerVerifyResult> {
  try {
    console.log('[verifyWithServer] Starting scan for:', dinaCode);

    // Step 1: scan/start - 세션 발급
    const startRes = await Http.request({
      method: 'POST',
      url: API_BASE_URL + '/api/geocam/scan/start',
      headers: { 'Content-Type': 'application/json' },
      data: {
        qr_payload: dinaCode,
        device_id: deviceId,
      }
    });

    const startData = startRes.data;
    console.log('[verifyWithServer] scan/start response:', startData.success, startData.asset_status);

    if (!startData.success) {
      return {
        success: false,
        isAuthentic: false,
        status: 'UNKNOWN',
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
    const verifyRes = await Http.request({
      method: 'POST',
      url: API_BASE_URL + '/api/geocam/verify',
      headers: { 'Content-Type': 'application/json' },
      data: {
        session_token: startData.session_token,
        nonce: startData.nonce,
        image_data: imageData,
        client_confidence: clientConfidence,
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
      }
    });

    const verifyData = verifyRes.data;
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

    return {
      success: verifyData.success,
      isAuthentic: verifyData.result === 'VALID',
      status: verifyData.result || 'UNKNOWN',
      confidence: verifyData.confidence,
      sessionToken: startData.session_token,
      dinaId: verifyData.matched_dina_id || startData.asset_info?.dina_id,
      assetInfo: startData.asset_info,
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

    const res = await Http.request({
      method: 'POST',
      url: API_BASE_URL + '/api/geocam/register',
      headers: { 'Content-Type': 'application/json' },
      data: {
        session_token: sessionToken,
        nonce: nonce,
        dina_id: dinaId,
        ...gateAData,
        ...gateBData,
        ...gateCData,
      }
    });

    const data = res.data;
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

export async function runEvidencePipeline(input: PipelineInput): Promise<PipelineOutput> {
  try {
    // 1. QR 파싱
    const qrResult = parseQr(input.qrRaw);
    if (isError(qrResult)) {
      return { ok: false, error: 'QR_PARSE_FAILED: ' + qrResult.error, qr_status: 'invalid', verify_status: 'INVALID' };
    }
    const qrStatus = qrResult.status;
    const dinaCode = isMissing(qrResult) ? null : qrResult.dina_code;
    const otp = isMissing(qrResult) ? null : (qrResult.otp || null);
    console.log('[Pipeline] QR:', qrStatus, '| DINA:', dinaCode);

    // 2. 로컬 AI 엔진 호출 (GeoCode 감지)
    const geocodeResult = await detectGeocode(input.imageUri);
    console.log('[Pipeline] Local AI:', geocodeResult.status, '| confidence:', geocodeResult.confidence);

    // 3. 이미지를 Base64로 변환
    let imageBase64: string | null = null;
    try {
      imageBase64 = await imageUriToBase64(input.imageUri);
      console.log('[Pipeline] Image converted to Base64, length:', imageBase64?.length || 0);
    } catch (imgErr) {
      console.error('[Pipeline] Image conversion failed:', imgErr);
    }

    // 4. 서버 API 검증 (DINA 코드가 있고 이미지 변환 성공 시)
    let serverResult: ServerVerifyResult | null = null;
    if (dinaCode && imageBase64) {
      const clientConfidence = geocodeResult.confidence !== null
        ? Math.round(geocodeResult.confidence * 100)
        : undefined;

      serverResult = await verifyWithServer(
        dinaCode,
        input.deviceFingerprintHash,
        imageBase64,
        clientConfidence
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
          verify_status: 'INVALID',
        };
      }
    }

    // 5. 최종 verify_status 결정 (서버 결과 우선, 없으면 로컬 AI 결과 사용)
    let verifyStatus: 'VALID' | 'SUSPECT' | 'UNKNOWN' | 'INVALID';
    let finalConfidence: number | null = null;

    if (serverResult && serverResult.success) {
      // 서버 검증 결과 사용
      if (serverResult.status === 'VALID') {
        verifyStatus = 'VALID';
      } else if (serverResult.status === 'UNCERTAIN') {
        verifyStatus = 'SUSPECT';
      } else if (serverResult.status === 'INVALID') {
        verifyStatus = 'INVALID';
      } else {
        verifyStatus = 'UNKNOWN';
      }
      finalConfidence = serverResult.confidence || null;
    } else {
      // 서버 실패 시 로컬 AI 결과 사용
      const localConf = geocodeResult.confidence;
      if (geocodeResult.status === 'DETECTED') {
        if (localConf !== null && localConf >= 0.8) {
          verifyStatus = 'VALID';
        } else if (localConf !== null && localConf >= 0.5) {
          verifyStatus = 'SUSPECT';
        } else {
          verifyStatus = 'SUSPECT';
        }
        finalConfidence = localConf !== null ? Math.round(localConf * 100) : null;
      } else if (geocodeResult.status === 'NOT_DETECTED') {
        verifyStatus = 'INVALID';
      } else {
        verifyStatus = 'UNKNOWN';
      }
    }

    // 6. Evidence Pack 생성
    const evidencePack = {
      version: '2.0',
      qr_status: qrStatus,
      dinaCode,
      otp,
      imageUri: input.imageUri,
      geoBucket: input.geoBucket || null,
      deviceFingerprintHash: input.deviceFingerprintHash,
      geocode: {
        status: geocodeResult.status,
        geocodeId: geocodeResult.geocodeId || null,
        confidence: geocodeResult.confidence || null,
        ai_mode: geocodeResult.ai_mode,
        ai_status: geocodeResult.ai_status,
        model_name: geocodeResult.model_name,
        model_version: geocodeResult.model_version,
      },
      server: serverResult ? {
        success: serverResult.success,
        status: serverResult.status,
        confidence: serverResult.confidence,
        dinaId: serverResult.dinaId,
        sessionToken: serverResult.sessionToken,
      } : null,
      timestamp: new Date().toISOString(),
    };

    // 7. Pack 정규화 및 서명
    const packCanonical = canonicalizePack(evidencePack);
    const packHash = await sha256(packCanonical);
    await ensureDeviceKeypair();
    await signPack(packCanonical);

    const recordId = generateUuid();
    const isOk = verifyStatus === 'VALID' || verifyStatus === 'SUSPECT';

    return {
      ok: isOk,
      recordId,
      packHash,
      qr_status: qrStatus,
      verify_status: verifyStatus,
      confidence: finalConfidence,
      error_code: serverResult?.error_code,
    };
  } catch (err) {
    console.error('[Pipeline] Error:', err);
    return {
      ok: false,
      error: 'PIPELINE_ERROR: ' + (err instanceof Error ? err.message : String(err)),
      verify_status: 'UNKNOWN',
    };
  }
}
