// src/plugins/YuvCameraPlugin.ts
// YUV Camera Plugin 타입 정의
// LC-CAM-YUV-001 v1.1

import { registerPlugin } from '@capacitor/core';

export interface YuvCameraPlugin {
  startYuvAnalysis(options?: Record<string, never>): Promise<void>;
  captureYuvFrame(options?: Record<string, never>): Promise<YuvFrameResult>;
  stopYuvAnalysis(options?: Record<string, never>): Promise<{ stopped: boolean }>;
}

export interface YuvFrameResult {
  yuvBase64: string;
  sourceWidth: number;
  sourceHeight: number;
  rotationDegrees: number;
  cropRectLeft: number;
  cropRectTop: number;
  cropRectRight: number;
  cropRectBottom: number;
  rowStride: number;
  pixelStride: number;
  lockStable: boolean;
  lockStableFrames: number;
  source: 'YUV_ANALYSIS';
}

const YuvCamera = registerPlugin<YuvCameraPlugin>('YuvCamera', {
  web: () => import('./YuvCameraPluginWeb').then(m => new m.YuvCameraPluginWeb()),
});

export { YuvCamera };