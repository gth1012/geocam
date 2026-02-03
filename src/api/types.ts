// GeoStudio API 타입 정의

export interface ScanStartRequest {
  qr_payload: string;
  device_id: string;
  app_version: string;
}

export interface ScanStartResponse {
  success: boolean;
  session_token: string;
  nonce: string;
  ttl_seconds: number;
  asset_status: 'SHIPPED' | 'ACTIVATED' | 'UNKNOWN';
  asset_info?: {
    dina_id: string;
    series_name: string;
    batch_id: string;
    created_at: string;
  };
  error?: string;
}

export interface VerifyRequest {
  session_token: string;
  nonce: string;
  image_data: string;
  client_confidence?: number;
  device_info: {
    platform: string;
    model: string;
    os_version: string;
  };
  // Write-Gate A: Ed25519 서명
  signature?: string;
  public_key?: string;
  client_timestamp?: number;
  // Write-Gate B: 디바이스 attestation
  app_attestation?: string;
  // Write-Gate C: GPS
  gps?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
}

export interface VerifyResponse {
  success: boolean;
  result: 'VALID' | 'UNCERTAIN' | 'INVALID';
  confidence: number;
  matched_dina_id?: string;
  trust_level?: 'L2_VERIFIED' | 'L1_OBSERVATION';
  gate_results?: Array<{
    gate: 'A' | 'B' | 'C';
    name: string;
    passed: boolean;
    reason?: string;
  }>;
  duplicate_suspect?: boolean;
  issues?: string[];
  retry_allowed: boolean;
  remaining_attempts: number;
  error?: string;
}

export interface StatusResponse {
  dina_id: string;
  status: 'SHIPPED' | 'ACTIVATED' | 'UNKNOWN';
  series_name?: string;
  activated_at?: string;
  is_authentic: boolean;
}

export interface RegisterRequest {
  session_token: string;
  nonce: string;
  dina_id: string;
  verification_confidence: number;
  device_info?: {
    platform: string;
    model: string;
    os_version: string;
  };
  gps?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  signature?: string;
  public_key?: string;
  client_timestamp?: number;
  app_attestation?: string;
}

export interface RegisterResponse {
  success: boolean;
  status: 'ACTIVATED' | 'ALREADY_ACTIVATED' | 'FAILED';
  activated_at?: string;
  error?: string;
}
