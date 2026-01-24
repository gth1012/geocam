/**
 * GeoCode AI Runner v2.0
 * - ONNX Runtime Web 실제 연동
 * - 오프라인 동작 지원
 * - AI 실패 시 스킵 처리
 */

import * as ort from 'onnxruntime-web';

export type GeocodeStatus = 'DETECTED' | 'NOT_DETECTED' | 'ERROR' | 'SKIPPED';
export type AiMode = 'real' | 'stub';
export type AiStatus = 'success' | 'skipped' | 'unavailable';

export interface GeocodeResult {
  status: GeocodeStatus;
  geocodeId: string | null;
  confidence: number | null;
  reason?: string;
  ai_mode: AiMode;
  ai_status: AiStatus;
  model_name: string;
  model_version: string;
}

// 감지 임계값
const DETECTION_THRESHOLD = 0.5;
const MODEL_NAME = 'GeoCodeModel';
const MODEL_VERSION = '1.0.0';

// ONNX 세션 캐시
let session: ort.InferenceSession | null = null;
let modelLoaded = false;
let loadError: string | null = null;

/**
 * ONNX 모델 로드
 */
async function loadModel(): Promise<boolean> {
  if (modelLoaded && session) return true;
  if (loadError) return false;
  
  try {
    session = await ort.InferenceSession.create('/GeoCodeModel.onnx');
    modelLoaded = true;
    console.log('[AI] GeoCodeModel.onnx 로드 성공');
    return true;
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'MODEL_LOAD_FAIL';
    console.warn('[AI] 모델 로드 실패:', loadError);
    return false;
  }
}

/**
 * 이미지를 텐서로 변환 (224x224 RGB)
 */
async function imageToTensor(imageUri: string): Promise<ort.Tensor> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 224;
      canvas.height = 224;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context failed'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, 224, 224);
      const imageData = ctx.getImageData(0, 0, 224, 224);
      const { data } = imageData;
      
      // RGB 정규화 (0-255 -> 0-1)
      const float32Data = new Float32Array(1 * 3 * 224 * 224);
      for (let i = 0; i < 224 * 224; i++) {
        float32Data[i] = data[i * 4] / 255.0;                    // R
        float32Data[224 * 224 + i] = data[i * 4 + 1] / 255.0;    // G
        float32Data[2 * 224 * 224 + i] = data[i * 4 + 2] / 255.0; // B
      }
      
      const tensor = new ort.Tensor('float32', float32Data, [1, 3, 224, 224]);
      resolve(tensor);
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = imageUri;
  });
}

/**
 * 이미지 URI를 분석하여 GeoCode 감지 결과 반환
 */
export async function detectGeocode(imageUri: string): Promise<GeocodeResult> {
  // 입력 검증
  if (!imageUri || imageUri === 'scan-mode-no-image') {
    return {
      status: 'NOT_DETECTED',
      geocodeId: null,
      confidence: null,
      reason: 'NO_IMAGE',
      ai_mode: 'real',
      ai_status: 'skipped',
      model_name: MODEL_NAME,
      model_version: MODEL_VERSION
    };
  }

  // 모델 로드 시도
  const loaded = await loadModel();
  
  if (!loaded || !session) {
    // AI 실패 시 스킵 처리 (파이프라인 중단 금지)
    console.warn('[AI] 모델 사용 불가 - 스킵 처리');
    return {
      status: 'SKIPPED',
      geocodeId: null,
      confidence: null,
      reason: loadError || 'MODEL_UNAVAILABLE',
      ai_mode: 'real',
      ai_status: 'unavailable',
      model_name: MODEL_NAME,
      model_version: MODEL_VERSION
    };
  }

  try {
    // 이미지  텐서 변환
    const inputTensor = await imageToTensor(imageUri);
    
    // ONNX 추론 실행
    const feeds = { input: inputTensor };
    const results = await session.run(feeds);
    
    // 결과 추출 (sigmoid 출력 0~1)
    const output = results.output || results[Object.keys(results)[0]];
    const confidence = (output.data as Float32Array)[0];
    
    console.log('[AI] 추론 완료 - confidence:', confidence);

    if (confidence >= DETECTION_THRESHOLD) {
      return {
        status: 'DETECTED',
        geocodeId: generateGeocodeId(),
        confidence: confidence,
        ai_mode: 'real',
        ai_status: 'success',
        model_name: MODEL_NAME,
        model_version: MODEL_VERSION
      };
    } else {
      return {
        status: 'NOT_DETECTED',
        geocodeId: null,
        confidence: confidence,
        ai_mode: 'real',
        ai_status: 'success',
        model_name: MODEL_NAME,
        model_version: MODEL_VERSION
      };
    }
  } catch (error) {
    // 추론 실패 시 스킵 처리
    const errorMsg = error instanceof Error ? error.message : 'INFER_FAIL';
    console.warn('[AI] 추론 실패 - 스킵 처리:', errorMsg);
    return {
      status: 'SKIPPED',
      geocodeId: null,
      confidence: null,
      reason: errorMsg,
      ai_mode: 'real',
      ai_status: 'skipped',
      model_name: MODEL_NAME,
      model_version: MODEL_VERSION
    };
  }
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
export function getModelStatus(): { loaded: boolean; version: string; mode: AiMode } {
  return {
    loaded: modelLoaded,
    version: MODEL_VERSION,
    mode: 'real'
  };
}
