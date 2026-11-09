'use strict';
// 서버 판정을 앱이 바꾸거나 다른 필드로 거부하지 않는지 확인합니다.
// 네트워크, DB, 카메라 및 설치된 APK는 사용하지 않습니다.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const typescript = require(process.env.NEO_TEST_TYPESCRIPT_PATH || require.resolve('typescript', { paths: [root] }));
const source = fs.readFileSync(path.join(root, 'src/verification/display.ts'), 'utf8');
const compiled = typescript.transpileModule(source, {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
}).outputText;
const moduleValue = { exports: {} };
vm.runInNewContext(compiled, { module: moduleValue, exports: moduleValue.exports, Object }, { timeout: 3000 });
const display = moduleValue.exports;
const cases = [];
function test(name, check) { check(); cases.push(name); }
function expectResult(body, status) {
  const result = display.parsePhysicalDisplayResponse(body);
  assert.equal(result.kind, 'result');
  assert.equal(result.status, status);
  assert.equal(result.registryStatus, 'NOT_CHECKED');
  assert.equal(result.response, body);
  return result;
}
function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}
try {
  test('server GEO_PASS is displayed as AUTHENTIC', () => {
    expectResult({ success: true, verdict: 'GEO_PASS' }, 'AUTHENTIC');
  });
  test('server GEO_FAIL is displayed as PHYSICAL_FAIL', () => {
    expectResult({ success: true, verdict: 'GEO_FAIL' }, 'PHYSICAL_FAIL');
  });
  test('server GEO_UNCERTAIN is displayed as PHYSICAL_UNREADABLE', () => {
    expectResult({ success: true, verdict: 'GEO_UNCERTAIN' }, 'PHYSICAL_UNREADABLE');
  });
  test('registration and ownership fields cannot block or change any server verdict', () => {
    for (const [verdict, status] of [['GEO_PASS', 'AUTHENTIC'], ['GEO_FAIL', 'PHYSICAL_FAIL'], ['GEO_UNCERTAIN', 'PHYSICAL_UNREADABLE']]) {
      for (const registry of [undefined, null, { checked: true, pass: false, status: 'UNREGISTERED' }, { checked: true, pass: true, status: 'REGISTERED_VALID' }]) {
        expectResult({ success: true, verdict, dina_id: 'TEST_ONLY', nonce: 'USED', timestamp_chain: null,
          verification: { registry, final: { pass: false, status: 'PHYSICAL_PASS_UNREGISTERED' } },
          six_axes: { final_pass: false, fail_reasons: ['REGISTRY_ONLY'] } }, status);
      }
    }
  });
  test('PASS cannot be downgraded using counts, scores or duplicate fields', () => {
    expectResult({ success: true, verdict: 'GEO_PASS', fullStructureCount: 0, detectedCount: 0, score: 0,
      geo_result: 'GEO_FAIL', transferIntegrity: false,
      verification: { physical: { pass: false, status: 'PHYSICAL_FAIL' }, final: { pass: false } } }, 'AUTHENTIC');
  });
  test('FAIL cannot be upgraded using counts, scores or duplicate fields', () => {
    expectResult({ success: true, verdict: 'GEO_FAIL', fullStructureCount: 52, detectedCount: 52, score: 1,
      geo_result: 'GEO_PASS', verification: { physical: { pass: true, status: 'PHYSICAL_PASS' }, final: { pass: true } } }, 'PHYSICAL_FAIL');
  });
  test('UNCERTAIN cannot be changed using evidence or legacy final', () => {
    expectResult({ success: true, verdict: 'GEO_UNCERTAIN', fullStructureCount: 52, confidence: 1,
      six_axes: { final_pass: true }, verification: { final: { status: 'AUTHENTIC', pass: true } } }, 'PHYSICAL_UNREADABLE');
  });
  test('camera parser never reads registration, evidence or duplicate verdict fields', () => {
    const body = { success: true, verdict: 'GEO_PASS' };
    for (const key of ['verification', 'six_axes', 'geo_result', 'verdict_source', 'verification_contract', 'transferIntegrity', 'detectedCount', 'confidence', 'dina_id', 'nonce']) {
      Object.defineProperty(body, key, { enumerable: true, get() { throw new Error('Unexpected field read: ' + key); } });
    }
    expectResult(body, 'AUTHENTIC');
  });
  test('server response object is preserved without mutation', () => {
    const body = freezeDeep({ success: true, verdict: 'GEO_FAIL', verification: { registry: { status: 'TEST' } }, array: [1, 2, 3] });
    const before = JSON.stringify(body);
    expectResult(body, 'PHYSICAL_FAIL');
    assert.equal(JSON.stringify(body), before);
  });
  test('missing or unknown verdict produces response error without inventing a judgment', () => {
    for (const raw of [null, undefined, false, [], {}, { success: true }, { success: true, verdict: null },
      { success: true, verdict: 'PASS' }, { success: true, verdict: 'PRESENT' }, { success: true, verdict: 'toString' },
      { success: true, verification: { physical: { pass: true }, final: { pass: true, status: 'AUTHENTIC' } } }]) {
      const result = display.parsePhysicalDisplayResponse(raw);
      assert.equal(result.kind, 'error');
      assert.equal(result.code, 'CONTRACT');
      assert.equal(Object.hasOwn(result, 'status'), false);
    }
  });
  test('unsuccessful response stays response error even if a verdict field exists', () => {
    for (const success of [false, undefined, null, 1, 'true']) {
      const result = display.parsePhysicalDisplayResponse({ success, verdict: 'GEO_PASS' });
      assert.equal(result.kind, 'error');
      assert.equal(result.code, 'CONTRACT');
    }
  });
  test('capture and transport errors remain errors without authenticity verdicts', () => {
    for (const code of ['NETWORK', 'HTTP', 'JSON', 'CAPTURE', 'INTEGRITY', 'PIPELINE']) {
      const result = display.displayError(code);
      assert.equal(result.kind, 'error');
      assert.equal(result.code, code);
      assert.equal(Object.hasOwn(result, 'status'), false);
    }
  });
  test('physical camera response cannot become registration success', () => {
    assert.equal(display.parseDisplayResponse({ success: true, verdict: 'GEO_PASS' }).kind, 'error');
  });
  test('late request gate still blocks previous requests after retry or cancel', () => {
    const gate = display.createRequestGate();
    const old = gate.begin(), current = gate.begin();
    assert.equal(gate.current(old), false);
    assert.equal(gate.current(current), true);
    gate.cancel();
    assert.equal(gate.current(current), false);
  });
  console.log(JSON.stringify({ Status: 'DISPLAY_AUTHORITY_CHECK_PASS', Cases: cases.length, Checks: cases,
    Authority: 'Server response verdict only; success validates response completion', NetworkUsed: false,
    Scope: 'Actual display.ts; no project typecheck, native build, installed APK or live camera test' }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ Status: 'DISPLAY_AUTHORITY_CHECK_FAILED', PassedCases: cases.length, Error: error.message }));
  process.exitCode = 1;
}
