// GeoCam API 호출 함수

import { apiClient } from './client';
import { signForGateA } from '../ed25519Signer';
import type {
  ScanStartRequest,
  ScanStartResponse,
  VerifyRequest,
  VerifyResponse,
  StatusResponse,
  RegisterRequest,
  RegisterResponse,
} from './types';

// 디바이스 ID 생성/조회
function getDeviceId(): string {
  let deviceId = localStorage.getItem('geocam_device_id');
  if (!deviceId) {
    deviceId = 'DEV-' + crypto.randomUUID().substring(0, 12).toUpperCase();
    localStorage.setItem('geocam_device_id', deviceId);
  }
  return deviceId;
}

// 디바이스 정보
function getDeviceInfo() {
  const ua = navigator.userAgent;
  let platform = 'Web';
  if (/iPhone|iPad/.test(ua)) platform = 'iOS';
  else if (/Android/.test(ua)) platform = 'Android';

  return {
    platform,
    model: navigator.platform || 'Unknown',
    os_version: navigator.userAgent.substring(0, 50),
  };
}

// QR 스캔 시작 - 세션 발급
export async function scanStart(qrPayload: string): Promise<ScanStartResponse> {
  const request: ScanStartRequest = {
    qr_payload: qrPayload,
    device_id: getDeviceId(),
    app_version: '2.0.0',
  };
  return apiClient.post<ScanStartResponse>('/geocam/scan/start', request);
}

// 이미지 검증 (Gate A 서명 포함)
export async function verify(
  sessionToken: string,
  nonce: string,
  imageData: string,
  dinaId: string,
  clientConfidence?: number
): Promise<VerifyResponse> {
  // Gate A: Ed25519 서명 생성
  const gateA = await signForGateA(nonce, dinaId);

  const request: VerifyRequest = {
    session_token: sessionToken,
    nonce: nonce,
    image_data: imageData,
    client_confidence: clientConfidence,
    device_info: getDeviceInfo(),
    signature: gateA.signature,
    public_key: gateA.public_key,
    client_timestamp: gateA.client_timestamp,
  };
  return apiClient.post<VerifyResponse>('/geocam/verify', request);
}

// 상태 조회
export async function getStatus(dinaId: string): Promise<StatusResponse> {
  return apiClient.get<StatusResponse>('/geocam/status/' + encodeURIComponent(dinaId));
}

// 최초 등록
export async function register(
  sessionToken: string,
  nonce: string,
  dinaId: string,
  verificationConfidence: number
): Promise<RegisterResponse> {
  const request: RegisterRequest = {
    session_token: sessionToken,
    nonce: nonce,
    dina_id: dinaId,
    verification_confidence: verificationConfidence,
  };
  return apiClient.post<RegisterResponse>('/geocam/register', request);
}
