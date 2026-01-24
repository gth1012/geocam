// QR 파싱 엔진 (TypeScript)
// DINA 형식: DINA-[A-Z0-9]{13}
// OTP 형식: OTP-[A-Z0-9]{8}
const DINA_REGEX = /DINA-[A-Z0-9]{13}/;
const OTP_REGEX = /OTP-[A-Z0-9]{8}/;

export type QrStatus = 'found' | 'missing' | 'invalid';

export interface QrParseSuccess {
  status: 'found';
  dina_code: string;
  otp?: string;
}

export interface QrParseMissing {
  status: 'missing';
  dina_code: null;
  otp: null;
}

export interface QrParseError {
  status: 'invalid';
  error: 'INVALID_INPUT' | 'DINA_NOT_FOUND';
}

export type QrParseResult = QrParseSuccess | QrParseMissing | QrParseError;

export function isError(result: QrParseResult): result is QrParseError {
  return result.status === 'invalid';
}

export function isMissing(result: QrParseResult): result is QrParseMissing {
  return result.status === 'missing';
}

export function parseQr(rawString: string | null | undefined): QrParseResult {
  // QR 없음 - missing 처리 (파이프라인 계속)
  if (!rawString || rawString === '' || rawString === 'NO_QR') {
    return { status: 'missing', dina_code: null, otp: null };
  }

  if (typeof rawString !== 'string') {
    return { status: 'invalid', error: 'INVALID_INPUT' };
  }

  const trimmed = rawString.trim();
  const dinaMatch = trimmed.match(DINA_REGEX);

  if (!dinaMatch) {
    return { status: 'invalid', error: 'DINA_NOT_FOUND' };
  }

  const dina_code = dinaMatch[0];
  const otpMatch = trimmed.match(OTP_REGEX);
  const otp = otpMatch ? otpMatch[0] : undefined;

  return { status: 'found', dina_code, otp };
}
