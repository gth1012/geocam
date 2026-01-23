// QR 파싱 엔진 (TypeScript)
// DINA 형식: DINA-[A-Z0-9]{13}
// OTP 형식: OTP-[A-Z0-9]{8}

const DINA_REGEX = /DINA-[A-Z0-9]{13}/;
const OTP_REGEX = /OTP-[A-Z0-9]{8}/;

export interface QrParseSuccess {
  dina_code: string;
  otp?: string;
}

export interface QrParseError {
  error: 'INVALID_INPUT' | 'DINA_NOT_FOUND';
}

export type QrParseResult = QrParseSuccess | QrParseError;

export function isError(result: QrParseResult): result is QrParseError {
  return 'error' in result;
}

export function parseQr(rawString: string): QrParseResult {
  if (!rawString || typeof rawString !== 'string') {
    return { error: 'INVALID_INPUT' };
  }

  const trimmed = rawString.trim();
  const dinaMatch = trimmed.match(DINA_REGEX);

  if (!dinaMatch) {
    return { error: 'DINA_NOT_FOUND' };
  }

  const dina_code = dinaMatch[0];
  const otpMatch = trimmed.match(OTP_REGEX);
  const otp = otpMatch ? otpMatch[0] : undefined;

  return otp ? { dina_code, otp } : { dina_code };
}
