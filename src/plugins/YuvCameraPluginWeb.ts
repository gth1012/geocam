// src/plugins/YuvCameraPluginWeb.ts
// YUV Camera Plugin Web fallback (개발용)
// LC-CAM-YUV-001 v1.1

import { WebPlugin } from '@capacitor/core';
import type { YuvCameraPlugin, YuvFrameResult } from './YuvCameraPlugin';

export class YuvCameraPluginWeb extends WebPlugin implements YuvCameraPlugin {
  async startYuvAnalysis(): Promise<void> {
    console.warn('[YuvCamera] Web: YUV not supported in browser');
  }

  async captureYuvFrame(): Promise<YuvFrameResult> {
    throw new Error('YuvCamera: not supported in browser');
  }

  async stopYuvAnalysis(): Promise<{ stopped: boolean }> {
    return { stopped: true };
  }
}