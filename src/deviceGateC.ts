/**
 * Write-Gate C: GPS 위치 검증 모듈
 *
 * 1. Capacitor Geolocation API로 GPS 좌표 수집 (네이티브)
 * 2. Web 환경에서는 navigator.geolocation 폴백
 * 3. 권한 거부 시 graceful 처리 (warn 로그, verify 계속 진행)
 */

import { Geolocation } from '@capacitor/geolocation';

export interface GateCPayload {
  gps: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  client_timestamp: number;
}

/**
 * Capacitor Geolocation API로 GPS 좌표 수집
 * 실패 시 Web API 폴백
 */
async function getCapacitorPosition(): Promise<GateCPayload> {
  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 10000,
  });

  return {
    gps: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? undefined,
    },
    client_timestamp: position.timestamp,
  };
}

/**
 * Web navigator.geolocation 폴백
 */
function getWebPosition(): Promise<GateCPayload> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation API not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          gps: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy ?? undefined,
          },
          client_timestamp: position.timestamp,
        });
      },
      (error) => {
        reject(new Error('WEB_GEO_' + error.code + ': ' + error.message));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
}

/**
 * Gate C GPS 페이로드 수집
 * 권한 거부 또는 에러 시 null 반환 (verify는 계속 진행)
 */
export async function buildGateCPayload(): Promise<GateCPayload | null> {
  // 1차: Capacitor Geolocation
  try {
    const result = await getCapacitorPosition();
    console.log('[GateC] Capacitor GPS:', result.gps.latitude, result.gps.longitude, '±', result.gps.accuracy);
    return result;
  } catch (e) {
    console.warn('[GateC] Capacitor Geolocation failed, trying web fallback:', e);
  }

  // 2차: Web navigator.geolocation
  try {
    const result = await getWebPosition();
    console.log('[GateC] Web GPS:', result.gps.latitude, result.gps.longitude, '±', result.gps.accuracy);
    return result;
  } catch (e) {
    console.warn('[GateC] GPS unavailable (permission denied or unsupported):', e);
  }

  // 둘 다 실패 → null (verify는 GPS 없이 계속 진행)
  return null;
}
