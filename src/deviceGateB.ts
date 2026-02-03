/**
 * Write-Gate B: 디바이스 검증 모듈
 *
 * 1. Capacitor Device API로 실제 디바이스 정보 수집 (네이티브)
 * 2. Web 환경에서는 UA 기반 폴백
 * 3. app_attestation: V1 임시 구현 — SHA256(device_id + app_version + timestamp)
 *    향후 Apple DeviceCheck / Google Play Integrity로 교체 예정
 */

import { Device } from '@capacitor/device';

const APP_VERSION = '2.0.0';

export interface GateBPayload {
  device_info: {
    platform: string;
    model: string;
    os_version: string;
  };
  app_attestation: string;  // SHA256 hex (64자 이상 — 서버 최소 32자 검증 통과)
}

// ─── SHA256 유틸 ───

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── 디바이스 ID (localStorage 기반, 앱 전역 공유) ───

function getDeviceId(): string {
  let deviceId = localStorage.getItem('geocam_device_id');
  if (!deviceId) {
    deviceId = 'DEV-' + crypto.randomUUID().substring(0, 12).toUpperCase();
    localStorage.setItem('geocam_device_id', deviceId);
  }
  return deviceId;
}

// ─── Capacitor Device API 캐시 ───

let cachedDeviceInfo: { platform: string; model: string; os_version: string } | null = null;
let cachedNativeId: string | null = null;

/**
 * Capacitor Device.getInfo() + Device.getId() 호출
 * 네이티브 환경에서만 동작, Web 환경에서는 UA 폴백
 */
async function fetchCapacitorDeviceInfo(): Promise<{
  platform: string;
  model: string;
  os_version: string;
  native_id: string | null;
}> {
  // 캐시 있으면 반환
  if (cachedDeviceInfo) {
    return { ...cachedDeviceInfo, native_id: cachedNativeId };
  }

  try {
    const info = await Device.getInfo();
    let nativeId: string | null = null;
    try {
      const idResult = await Device.getId();
      nativeId = idResult.identifier || null;
    } catch {
      // Device.getId() 미지원 환경 (Web)
    }

    cachedDeviceInfo = {
      platform: info.platform || 'web',       // 'ios' | 'android' | 'web'
      model: info.model || info.name || 'Unknown',
      os_version: info.osVersion || 'Unknown',
    };
    cachedNativeId = nativeId;

    console.log('[GateB] Capacitor Device:', cachedDeviceInfo.platform, cachedDeviceInfo.model, cachedDeviceInfo.os_version);
    return { ...cachedDeviceInfo, native_id: nativeId };
  } catch (e) {
    // Capacitor 미사용 환경 (순수 브라우저)
    console.warn('[GateB] Capacitor Device API unavailable, using UA fallback');
    return getWebFallbackInfo();
  }
}

/**
 * Web 환경 UA 기반 폴백
 */
function getWebFallbackInfo(): {
  platform: string;
  model: string;
  os_version: string;
  native_id: null;
} {
  const ua = navigator.userAgent;
  let platform = 'web';
  if (/iPhone|iPad/.test(ua)) platform = 'ios';
  else if (/Android/.test(ua)) platform = 'android';

  return {
    platform,
    model: navigator.platform || 'Unknown',
    os_version: ua.substring(0, 50),
    native_id: null,
  };
}

// ─── 공개 API ───

/**
 * Gate B 페이로드 생성
 * - device_info: Capacitor Device API (네이티브) 또는 UA 폴백 (Web)
 * - app_attestation: SHA256(device_id + native_id + app_version + timestamp)
 *   V1 임시 구현. 향후 Apple DeviceCheck / Google Play Integrity로 교체.
 */
export async function buildGateBPayload(): Promise<GateBPayload> {
  const deviceData = await fetchCapacitorDeviceInfo();
  const deviceId = getDeviceId();
  const timestamp = Date.now();

  // V1 attestation: SHA256(device_id + native_id + app_version + timestamp)
  // 서버 최소 길이 검증(32자)을 통과하는 64자 hex
  const attestationInput = [
    deviceId,
    deviceData.native_id || 'web',
    APP_VERSION,
    deviceData.platform,
    deviceData.model,
    String(timestamp),
  ].join(':');

  const attestation = await sha256Hex(attestationInput);

  console.log('[GateB] attestation generated | platform:', deviceData.platform, '| len:', attestation.length);

  return {
    device_info: {
      platform: deviceData.platform,
      model: deviceData.model,
      os_version: deviceData.os_version,
    },
    app_attestation: attestation,
  };
}

/**
 * 디바이스 정보만 조회 (attestation 없이)
 */
export async function getDeviceInfo(): Promise<{
  platform: string;
  model: string;
  os_version: string;
}> {
  const data = await fetchCapacitorDeviceInfo();
  return {
    platform: data.platform,
    model: data.model,
    os_version: data.os_version,
  };
}
