/**
 * Evidence Pipeline (E2E Orchestrator)
 * Phase 2-A / Step 6
 * - GeoCode AI 연동
 */
import { parseQr, isError } from './qrParser';
import { canonicalizePack } from './packCanonical';
import { ensureDeviceKeypair, signPack } from './ed25519Signer';
import { appendRecord } from './appendOnlyStore';
import { detectGeocode } from './geocodeEngine';

export interface PipelineInput {
  qrRaw: string;
  imageUri: string;
  geoBucket?: string | null;
  deviceFingerprintHash: string;
}

export interface PipelineOutput {
  ok: boolean;
  recordId?: string;
  packHash?: string;
  error?: string;
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
    // 1. QR 파싱
    const qrResult = parseQr(input.qrRaw);
    if (isError(qrResult)) {
      return { ok: false, error: 'QR_PARSE_FAILED: ' + qrResult.error };
    }

    // 2. GeoCode AI 감지 (async)
    const geocodeResult = await detectGeocode(input.imageUri);

    // 3. Evidence Pack 조립
    const evidencePack = {
      version: '2.0',
      dinaCode: qrResult.dina_code,
      otp: qrResult.otp || null,
      imageUri: input.imageUri,
      geoBucket: input.geoBucket || null,
      deviceFingerprintHash: input.deviceFingerprintHash,
      geocode: {
        status: geocodeResult.status,
        geocodeId: geocodeResult.geocodeId || null,
        confidence: geocodeResult.confidence || null
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
      packHash: packHash
    };
  } catch (err) {
    return {
      ok: false,
      error: 'PIPELINE_ERROR: ' + (err instanceof Error ? err.message : String(err))
    };
  }
}

