// GeoCam API 호출 함수

import { apiClient } from './client';
import { signForGateA } from '../ed25519Signer';
import { buildGateBPayload } from '../deviceGateB';
import { buildGateCPayload } from '../deviceGateC';
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

// QR 스캔 시작 - 세션 발급
export async function scanStart(qrPayload: string): Promise<ScanStartResponse> {
  const request: ScanStartRequest = {
    qr_payload: qrPayload,
    device_id: getDeviceId(),
    app_version: '2.0.0',
  };
  return apiClient.post<ScanStartResponse>('/geocam/scan/start', request);
}

// 이미지 검증 (Gate A + B + C 포함)
export async function verify(
  sessionToken: string,
  nonce: string,
  imageData: string,
  dinaId: string,
  clientConfidence?: number
): Promise<VerifyResponse> {
  // Gate A: Ed25519 서명 생성
  const gateA = await signForGateA(nonce, dinaId);

  // Gate B: 디바이스 검증 페이로드
  const gateB = await buildGateBPayload();

  // Gate C: GPS 위치 (실패 시 null → verify는 계속 진행)
  const gateC = await buildGateCPayload();

  const request: VerifyRequest = {
    session_token: sessionToken,
    nonce: nonce,
    image_data: imageData,
    client_confidence: clientConfidence,
    device_info: gateB.device_info,
    app_attestation: gateB.app_attestation,
    signature: gateA.signature,
    public_key: gateA.public_key,
    client_timestamp: gateA.client_timestamp,
    ...(gateC && { gps: gateC.gps }),
  };
  return apiClient.post<VerifyResponse>('/geocam/verify', request);
}

// 상태 조회
export async function getStatus(dinaId: string): Promise<StatusResponse> {
  return apiClient.get<StatusResponse>('/geocam/status/' + encodeURIComponent(dinaId));
}

// 최초 등록 (Gate A + B + C 포함)
export async function register(
  sessionToken: string,
  nonce: string,
  dinaId: string,
  verificationConfidence: number
): Promise<RegisterResponse> {
  // Gate A: Ed25519 서명
  const gateA = await signForGateA(nonce, dinaId);

  // Gate B: 디바이스 검증
  const gateB = await buildGateBPayload();

  // Gate C: GPS 위치
  const gateC = await buildGateCPayload();

  const request: RegisterRequest = {
    session_token: sessionToken,
    nonce: nonce,
    dina_id: dinaId,
    verification_confidence: verificationConfidence,
    device_info: gateB.device_info,
    app_attestation: gateB.app_attestation,
    signature: gateA.signature,
    public_key: gateA.public_key,
    client_timestamp: gateA.client_timestamp,
    ...(gateC && { gps: gateC.gps }),
  };
  return apiClient.post<RegisterResponse>('/geocam/register', request);
}
