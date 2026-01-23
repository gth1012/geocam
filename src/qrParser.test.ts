/**
 * QR 파싱 엔진 테스트
 */

import { parseQr } from './qrParser';

// 테스트 케이스
const tests = [
  // 정상 케이스
  { input: 'DINA-LJH001A7X9K2M', expected: { dina_code: 'DINA-LJH001A7X9K2M' } },
  { input: 'DINA-ABC123DEF456', expected: { dina_code: 'DINA-ABC123DEF456' } },
  { input: 'DINA-LJH001A7X9K2M OTP-ABCD1234', expected: { dina_code: 'DINA-LJH001A7X9K2M', otp: 'OTP-ABCD1234' } },
  { input: 'https://artion.io/verify?code=DINA-XYZ789QWE123', expected: { dina_code: 'DINA-XYZ789QWE123' } },
  
  // 에러 케이스
  { input: '', expected: { error: 'INVALID_INPUT' } },
  { input: 'invalid string', expected: { error: 'DINA_NOT_FOUND' } },
  { input: 'DINA-SHORT', expected: { error: 'DINA_NOT_FOUND' } },
];

// 테스트 실행
let passed = 0;
let failed = 0;

tests.forEach((test, i) => {
  const result = parseQr(test.input);
  const resultStr = JSON.stringify(result);
  const expectedStr = JSON.stringify(test.expected);
  
  if (resultStr === expectedStr) {
    console.log(` Test ${i + 1} PASSED`);
    passed++;
  } else {
    console.log(` Test ${i + 1} FAILED`);
    console.log(`   Input: "${test.input}"`);
    console.log(`   Expected: ${expectedStr}`);
    console.log(`   Got: ${resultStr}`);
    failed++;
  }
});

console.log(`\n결과: ${passed}/${tests.length} 통과`);

