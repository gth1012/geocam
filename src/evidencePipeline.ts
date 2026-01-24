/**
 * Evidence Pipeline (E2E Orchestrator)
 * Phase 2-A / Step 6
 * - GeoCode AI 연동
 * - QR missing 시에도 파이프라인 계속 실행
 */
import { parseQr, isError, isMissing } from './qrParser';
import { canonicalizePack } from './packCanonical';
import { ensureDeviceKeypair, signPack } from './ed25519Signer';
import { appendRecord } from './appendOnlyStore';
import { detectGeocode } from './geocodeEngine';

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
}

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function runEvidencePipeline(input: PipelineInput): Promise<PipelineOutput> {
  try {
    // 1. QR 파싱 (missing도 허용)
    const qrResult = parseQr(input.qrRaw);
    
    // invalid만 에러 처리, missing은 계속 진행
    if (isError(qrResult)) {
      return { ok: false, error: 'QR_PARSE_FAILED: ' + qrResult.error, qr_status: 'invalid' };
    }

    const qrStatus = qrResult.status; // 'found' | 'missing'
    const dinaCode = isMissing(qrResult) ? null : qrResult.dina_code;
    const otp = isMissing(qrResult) ? null : (qrResult.otp || null);

    console.log('[Pipeline] QR 상태:', qrStatus, '| DINA:', dinaCode);

    // 2. GeoCode AI 감지 (항상 실행)
    console.log('[Pipeline] AI 감지 시작');
    const geocodeResult = await detectGeocode(input.imageUri);
    console.log('[Pipeline] AI 감지 완료:', geocodeResult.status, geocodeResult.ai_status);

    // 3. Evidence Pack 조립 (QR 없어도 생성)
    const evidencePack = {
      version: '2.0',
      qr_status: qrStatus,
      dinaCode: dinaCode,
      otp: otp,
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
        model_version: geocodeResult.model_version
      },
      timestamp: new Date().toISOString()
    };

    // 4. Pack Canonical + Hash
    const packCanonical = canonicalizePack(evidencePack);
    const packHash = await sha256(packCanonical);

    // 5. Ed25519 서명
    await ensureDeviceKeypair();
    const signResult = await signPack(packCanonical);

    // 6. Append-Only 체인 저장
    const appendResult = await appendRecord(
      packCanonical,
      packHash,
      signResult.signatureBase64,
      signResult.keyId
    );

    return {
      ok: true,
      recordId: appendResult.recordId,
      packHash: packHash,
      qr_status: qrStatus
    };
  } catch (err) {
    return {
      ok: false,
      error: 'PIPELINE_ERROR: ' + (err instanceof Error ? err.message : String(err))
    };
  }
}
