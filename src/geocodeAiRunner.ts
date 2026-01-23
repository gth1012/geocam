/**
 * GeoCode AI Runner v1.0
 * - ONNX 모델을 이용한 GeoCode 감지
 * - 오프라인 동작 지원
 */

export type GeocodeStatus = 'DETECTED' | 'NOT_DETECTED' | 'ERROR';

export interface GeocodeResult {
  status: GeocodeStatus;
  geocodeId: string | null;
  confidence: number | null;
  reason?: string;
}

// 감지 임계값
const DETECTION_THRESHOLD = 0.5;

/**
 * 이미지 URI를 분석하여 GeoCode 감지 결과 반환
 * 
 * 현재: 시뮬레이션 모드 (ONNX 런타임 미연결)
 * 추후: ONNX Runtime Web 연결 예정
 * 
 * @param imageUri - base64 이미지 또는 URI
 * @returns GeocodeResult
 */
export async function detectGeocode(imageUri: string): Promise<GeocodeResult> {
  try {
    // 입력 검증
    if (!imageUri || imageUri === 'scan-mode-no-image') {
      return {
        status: 'NOT_DETECTED',
        geocodeId: null,
        confidence: null,
        reason: 'NO_IMAGE'
      };
    }

    // TODO: ONNX Runtime Web 연동
    // 현재는 시뮬레이션 - 이미지 해시 기반 pseudo-random confidence
    const confidence = simulateInference(imageUri);

    if (confidence >= DETECTION_THRESHOLD) {
      return {
        status: 'DETECTED',
        geocodeId: generateGeocodeId(),
        confidence: confidence
      };
    } else {
      return {
        status: 'NOT_DETECTED',
        geocodeId: null,
        confidence: confidence
      };
    }
  } catch (error) {
    return {
      status: 'ERROR',
      geocodeId: null,
      confidence: null,
      reason: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
    };
  }
}

/**
 * 시뮬레이션 추론 (ONNX 연동 전 임시)
 * 이미지 데이터 기반 pseudo-random confidence 생성
 */
function simulateInference(imageUri: string): number {
  // 이미지 URI 해시 기반 시뮬레이션
  let hash = 0;
  for (let i = 0; i < Math.min(imageUri.length, 1000); i++) {
    hash = ((hash << 5) - hash) + imageUri.charCodeAt(i);
    hash = hash & hash;
  }
  // 0.3 ~ 0.8 범위의 confidence 생성
  const normalized = Math.abs(hash % 1000) / 1000;
  return 0.3 + (normalized * 0.5);
}

/**
 * GeoCode ID 생성
 */
function generateGeocodeId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'GEO-';
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * 모델 상태 확인
 */
export function getModelStatus(): { loaded: boolean; version: string } {
  return {
    loaded: true,
    version: '1.0.0-sim' // 시뮬레이션 버전
  };
}
