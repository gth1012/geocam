// 촬영 품질 체크 Hook

export interface QualityResult {
  passed: boolean;
  brightness: number;
  brightnessStatus: 'OK' | 'TOO_DARK' | 'TOO_BRIGHT';
  blur: number;
  blurStatus: 'OK' | 'BLURRY';
  message: string;
}

const MIN_BRIGHTNESS = 50;
const MAX_BRIGHTNESS = 200;
const BLUR_THRESHOLD = 100;

function analyzeBrightness(imageData: ImageData): number {
  const data = imageData.data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return sum / (data.length / 4);
}

function analyzeBlur(imageData: ImageData): number {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
  }
  let sum = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap = -gray[idx - width - 1] - gray[idx - width] - gray[idx - width + 1] - gray[idx - 1] + 8 * gray[idx] - gray[idx + 1] - gray[idx + width - 1] - gray[idx + width] - gray[idx + width + 1];
      sum += lap * lap;
      count++;
    }
  }
  return Math.sqrt(sum / count);
}

export async function checkImageQuality(imageUri: string): Promise<QualityResult> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 200;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ passed: true, brightness: 128, brightnessStatus: 'OK', blur: 100, blurStatus: 'OK', message: '품질 체크 스킵' });
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      const imageData = ctx.getImageData(0, 0, size, size);
      const brightness = analyzeBrightness(imageData);
      const blur = analyzeBlur(imageData);
      let brightnessStatus: 'OK' | 'TOO_DARK' | 'TOO_BRIGHT' = 'OK';
      if (brightness < MIN_BRIGHTNESS) brightnessStatus = 'TOO_DARK';
      else if (brightness > MAX_BRIGHTNESS) brightnessStatus = 'TOO_BRIGHT';
      const blurStatus: 'OK' | 'BLURRY' = blur >= BLUR_THRESHOLD ? 'OK' : 'BLURRY';
      const passed = brightnessStatus === 'OK' && blurStatus === 'OK';
      let message = '촬영 품질 양호';
      if (brightnessStatus === 'TOO_DARK') message = '너무 어둡습니다';
      else if (brightnessStatus === 'TOO_BRIGHT') message = '너무 밝습니다';
      else if (blurStatus === 'BLURRY') message = '흔들렸습니다';
      resolve({ passed, brightness: Math.round(brightness), brightnessStatus, blur: Math.round(blur), blurStatus, message });
    };
    img.onerror = () => {
      resolve({ passed: true, brightness: 128, brightnessStatus: 'OK', blur: 100, blurStatus: 'OK', message: '이미지 로드 실패' });
    };
    img.src = imageUri;
  });
}
