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
}

export interface VerifyResponse {
  success: boolean;
  result: 'VALID' | 'UNCERTAIN' | 'INVALID';
  confidence: number;
  matched_dina_id?: string;
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
}

export interface RegisterResponse {
  success: boolean;
  status: 'ACTIVATED' | 'ALREADY_ACTIVATED' | 'FAILED';
  activated_at?: string;
  error?: string;
}
