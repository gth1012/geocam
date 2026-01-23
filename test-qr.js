// QR 파싱 엔진 테스트 (13자리 DINA)

const DINA_REGEX = /DINA-[A-Z0-9]{13}/;
const OTP_REGEX = /OTP-[A-Z0-9]{8}/;

function parseQr(rawString) {
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

const tests = [
  { input: 'DINA-LJH001A7X9K2M', expected: { dina_code: 'DINA-LJH001A7X9K2M' } },
  { input: 'DINA-ABC123DEF456X', expected: { dina_code: 'DINA-ABC123DEF456X' } },
  { input: 'DINA-LJH001A7X9K2M OTP-ABCD1234', expected: { dina_code: 'DINA-LJH001A7X9K2M', otp: 'OTP-ABCD1234' } },
  { input: 'https://artion.io/verify?code=DINA-XYZ789QWE123X', expected: { dina_code: 'DINA-XYZ789QWE123X' } },
  { input: '', expected: { error: 'INVALID_INPUT' } },
  { input: 'invalid string', expected: { error: 'DINA_NOT_FOUND' } },
  { input: 'DINA-SHORT', expected: { error: 'DINA_NOT_FOUND' } },
  { input: 'DINA-ABC123DEF456', expected: { error: 'DINA_NOT_FOUND' } },
];

let passed = 0;
tests.forEach((test, i) => {
  const result = parseQr(test.input);
  const ok = JSON.stringify(result) === JSON.stringify(test.expected);
  console.log((ok ? 'PASS' : 'FAIL') + ' Test ' + (i + 1));
  if (ok) passed++;
});
console.log('Result: ' + passed + '/' + tests.length);
