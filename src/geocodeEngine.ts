/**
 * GeoCode Engine v4.0
 * - Phase 4: GeoStudio detect-layer2 서버 검출 연결
 */

export type GeocodeStatus = 'DETECTED' | 'NOT_DETECTED' | 'ERROR' | 'SKIPPED' | 'PENDING_SERVER_DETECT';
export type AiMode = 'real' | 'stub' | 'bypassed' | 'server';
export type AiStatus = 'success' | 'skipped' | 'unavailable' | 'bypassed';
export type GeoCodeSource = 'LOCAL_ONNX' | 'SERVER_DETECT' | 'NONE';

export interface GeocodeResult {
  status: GeocodeStatus;
  geocodeId: string | null;
  confidence: number | null;
  reason?: string;
  ai_mode: AiMode;
  ai_status: AiStatus;
  model_name: string;
  model_version: string;
  source: GeoCodeSource;
  // 서버 검출 결과
  verdict?: string;
  avg_score?: number;
  pass_count?: number;
  total_valid?: number;
  pass_threshold?: number;
}

const GEO_STUDIO_URL = import.meta.env.VITE_GEO_API_URL || 'https://geo-api.artionchain.com';
const GEO_API_KEY = import.meta.env.VITE_GEO_API_KEY || 'geo-artion-2026-prod';

// ── 서버 detect-layer2 호출 ───────────────────────────────────────────────
async function runServerGeoCodeDetect(imageUri: string, dinaId?: string): Promise<GeocodeResult> {
  try {
    console.log('[GeoCode] SERVER_DETECT 시작 dinaId:', dinaId);

    // dataURL → Blob 변환
    const response = await fetch(imageUri);
    const blob = await response.blob();

    // FormData 구성
    const formData = new FormData();
    formData.append('image', blob, 'capture.png');
    formData.append('dina_id', dinaId || 'LEGIT-CAM-TEST');
    formData.append('candidate', 'A');
    formData.append('device_hint', 'legit-cam-mobile');
    formData.append('app_version', '4.0.0');

    // detect-layer2 호출
    const detectResponse = await fetch(`${GEO_STUDIO_URL}/api/geocode/detect-layer2`, {
      method: 'POST',
      headers: {
        'x-api-key': GEO_API_KEY,
      },
      body: formData,
      signal: AbortSignal.timeout(10000),
    });

    if (!detectResponse.ok) {
      throw new Error(`서버 오류: ${detectResponse.status}`);
    }

    const result = await detectResponse.json();
    console.log('[GeoCode] SERVER_DETECT 결과:', result.verdict, 'avg:', result.avg_score, 'pass:', result.pass_count);

    const isPass = result.verdict === 'PASS';

    return {
      status: isPass ? 'DETECTED' : 'NOT_DETECTED',
      geocodeId: isPass ? `GEO-${result.dina_id}` : null,
      confidence: result.avg_score || null,
      ai_mode: 'server',
      ai_status: 'success',
      model_name: 'GeoCodeLayer2',
      model_version: 'v3',
      source: 'SERVER_DETECT',
      verdict: result.verdict,
      avg_score: result.avg_score,
      pass_count: result.pass_count,
      total_valid: result.total_valid,
      pass_threshold: result.pass_threshold,
    };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[GeoCode] SERVER_DETECT 실패:', msg);
    return {
      status: 'ERROR',
      geocodeId: null,
      confidence: null,
      reason: msg,
      ai_mode: 'server',
      ai_status: 'unavailable',
      model_name: 'GeoCodeLayer2',
      model_version: 'v3',
      source: 'NONE',
    };
  }
}

// ── 메인 진입점 ───────────────────────────────────────────────────────────
export async function detectGeocode(imageUri: string, dinaId?: string): Promise<GeocodeResult> {
  console.log('[GeoCode] detectGeocode v4.0 시작');
  console.log('[GeoCode] LOCAL_ONNX: DISABLED');
  console.log('[GeoCode] SERVER_DETECT: ENABLED');
  return await runServerGeoCodeDetect(imageUri, dinaId);
}
