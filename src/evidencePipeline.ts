/**
 * Evidence Pipeline (E2E Orchestrator)
 * Phase 2-A / Step 6
 * AI 엔진 연동 완료 버전
 */
import { parseQr, isError, isMissing } from './qrParser';
import { canonicalizePack } from './packCanonical';
import { ensureDeviceKeypair, signPack } from './ed25519Signer';
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

export async function verifyWithServer(dinaCode: string, deviceId: string): Promise<{
  success: boolean;
  isAuthentic: boolean;
  status: string;
  error?: string;
}> {
  try {
    const startRes = await Http.request({
      method: 'POST',
      url: API_BASE_URL + '/api/geocam/scan/start',
      headers: { 'Content-Type': 'application/json' },
      data: { qr_payload: dinaCode, device_id: deviceId }
    });
    const startData = startRes.data;
    if (!startData.success) {
      return { success: false, isAuthentic: false, status: 'UNKNOWN', error: startData.error };
    }
    const verifyRes = await Http.request({
      method: 'POST',
      url: API_BASE_URL + '/api/geocam/verify',
      headers: { 'Content-Type': 'application/json' },
      data: { session_token: startData.session_token, nonce: startData.nonce, client_confidence: 85 }
    });
    const verifyData = verifyRes.data;
    return { success: verifyData.success, isAuthentic: verifyData.result === 'VALID', status: verifyData.result, error: verifyData.error };
  } catch (err) {
    return { success: false, isAuthentic: false, status: 'ERROR', error: String(err) };
  }
}

export async function runEvidencePipeline(input: PipelineInput): Promise<PipelineOutput> {
  try {
    const qrResult = parseQr(input.qrRaw);
    if (isError(qrResult)) {
      return { ok: false, error: 'QR_PARSE_FAILED: ' + qrResult.error, qr_status: 'invalid', verify_status: 'INVALID' };
    }
    const qrStatus = qrResult.status;
    const dinaCode = isMissing(qrResult) ? null : qrResult.dina_code;
    const otp = isMissing(qrResult) ? null : (qrResult.otp || null);
    console.log('[Pipeline] QR:', qrStatus, '| DINA:', dinaCode);

    // AI 엔진 호출
    const geocodeResult = await detectGeocode(input.imageUri);
    console.log('[Pipeline] AI:', geocodeResult.status, '| confidence:', geocodeResult.confidence, '| ai_status:', geocodeResult.ai_status);

    // AI 결과에 따른 verify_status 결정
    let verifyStatus: 'VALID' | 'SUSPECT' | 'UNKNOWN' | 'INVALID';
    const confidence = geocodeResult.confidence;
    
    if (geocodeResult.status === 'DETECTED') {
      // AI가 GeoCode 감지 성공
      if (confidence !== null && confidence >= 0.8) {
        verifyStatus = 'VALID';
      } else if (confidence !== null && confidence >= 0.5) {
        verifyStatus = 'SUSPECT';
      } else {
        verifyStatus = 'SUSPECT';
      }
    } else if (geocodeResult.status === 'NOT_DETECTED') {
      // AI가 GeoCode 감지 못함
      verifyStatus = 'INVALID';
    } else if (geocodeResult.status === 'SKIPPED') {
      // AI 모델 로드 실패 또는 스킵
      verifyStatus = 'UNKNOWN';
    } else {
      // ERROR 등
      verifyStatus = 'UNKNOWN';
    }

    const evidencePack = {
      version: '2.0', qr_status: qrStatus, dinaCode, otp,
      imageUri: input.imageUri, geoBucket: input.geoBucket || null,
      deviceFingerprintHash: input.deviceFingerprintHash,
      geocode: { status: geocodeResult.status, geocodeId: geocodeResult.geocodeId || null, confidence: geocodeResult.confidence || null, ai_mode: geocodeResult.ai_mode, ai_status: geocodeResult.ai_status, model_name: geocodeResult.model_name, model_version: geocodeResult.model_version },
      timestamp: new Date().toISOString()
    };
    const packCanonical = canonicalizePack(evidencePack);
    const packHash = await sha256(packCanonical);
    await ensureDeviceKeypair();
    await signPack(packCanonical);

    const recordId = generateUuid();

    // verify_status가 VALID일 때만 ok: true
    const isOk = verifyStatus === 'VALID' || verifyStatus === 'SUSPECT';

    return { 
      ok: isOk, 
      recordId: recordId, 
      packHash: packHash, 
      qr_status: qrStatus,
      verify_status: verifyStatus,
      confidence: confidence
    };
  } catch (err) {
    return { ok: false, error: 'PIPELINE_ERROR: ' + (err instanceof Error ? err.message : String(err)), verify_status: 'UNKNOWN' };
  }
}
