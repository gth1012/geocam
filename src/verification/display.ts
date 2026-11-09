// Display contract only. Never infer authenticity from physical scores or legacy PASS.
export type DisplayError = 'REFERENCE_PENDING' | 'NETWORK' | 'HTTP' | 'JSON' | 'CONTRACT' | 'INTEGRITY' | 'CAPTURE' | 'PIPELINE'
export type FinalStatus = 'AUTHENTIC' | 'PHYSICAL_FAIL' | 'PHYSICAL_UNREADABLE' | 'PHYSICAL_PASS_UNREGISTERED' | 'PHYSICAL_PASS_REGISTRY_INVALID'
export type DisplayState = { kind: 'idle' } | { kind: 'processing' } | { kind: 'error'; code: DisplayError; httpStatus?: number } | {
  kind: 'result'; status: FinalStatus; registryStatus: string; reasons: string[]; response: unknown
}
export const displayError = (code: DisplayError, httpStatus?: number): DisplayState => ({ kind: 'error', code, httpStatus })
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
export function parseDisplayResponse(raw: unknown): DisplayState {
  const body = object(raw)
  if (body.transferIntegrity === false) return displayError('INTEGRITY')
  const v = object(body.verification), final = object(v.final), physical = object(v.physical), registry = object(v.registry)
  const statuses: Record<string, [boolean, string, boolean]> = {
    AUTHENTIC: [true, 'PHYSICAL_PASS', true],
    PHYSICAL_FAIL: [false, 'PHYSICAL_FAIL', false],
    PHYSICAL_UNREADABLE: [false, 'PHYSICAL_UNREADABLE', false],
    PHYSICAL_PASS_UNREGISTERED: [false, 'PHYSICAL_PASS', true],
    PHYSICAL_PASS_REGISTRY_INVALID: [false, 'PHYSICAL_PASS', true],
  }
  const status = final.status
  if (body.success !== true || typeof status !== 'string' || !Object.hasOwn(statuses, status)) return displayError('CONTRACT')
  const [finalPass, physicalStatus, physicalPass] = statuses[status]
  if (final.pass !== finalPass || physical.status !== physicalStatus || physical.pass !== physicalPass || typeof registry.pass !== 'boolean' || typeof registry.status !== 'string') return displayError('CONTRACT')
  if (!['UNREGISTERED', 'REGISTERED_INVALID', 'SESSION_INVALID', 'REGISTRY_INCOMPLETE', 'REGISTERED_VALID'].includes(registry.status)) return displayError('CONTRACT')
  if (status === 'AUTHENTIC' && (registry.pass !== true || registry.status !== 'REGISTERED_VALID')) return displayError('CONTRACT')
  if (status.startsWith('PHYSICAL_PASS_') && registry.pass !== false) return displayError('CONTRACT')
  if (status === 'PHYSICAL_PASS_UNREGISTERED' && registry.status !== 'UNREGISTERED') return displayError('CONTRACT')
  if (status === 'PHYSICAL_PASS_REGISTRY_INVALID' && !['REGISTERED_INVALID', 'SESSION_INVALID', 'REGISTRY_INCOMPLETE'].includes(registry.status)) return displayError('CONTRACT')
  const physicalVerdicts: Record<string, string> = { GEO_PASS: 'PHYSICAL_PASS', GEO_FAIL: 'PHYSICAL_FAIL', GEO_UNCERTAIN: 'PHYSICAL_UNREADABLE' }
  if (typeof body.verdict === 'string' && Object.hasOwn(physicalVerdicts, body.verdict) && physicalVerdicts[body.verdict] !== physical.status) return displayError('CONTRACT')
  const axes = object(body.six_axes)
  if ('final_pass' in axes && axes.final_pass !== final.pass) return displayError('CONTRACT')
  const reasons = Array.isArray(axes.fail_reasons) ? axes.fail_reasons.filter((r): r is string => typeof r === 'string') : []
  return { kind: 'result', status: status as FinalStatus, registryStatus: registry.status, reasons, response: raw }
}
// 카메라 판정 권한은 네오 서버에만 있습니다.
// /geocode-block/detect의 verdict를 화면 상태로 1:1 대응하며 추가 판정 조건을 적용하지 않습니다.
// 등록정보, 구조 개수, 점수, 중복 판정 필드는 카메라 결과 표시 조건이 아닙니다.
export function parsePhysicalDisplayResponse(raw: unknown): DisplayState {
  const body = object(raw)
  const displayStatuses: Record<string, FinalStatus> = {
    GEO_PASS: 'AUTHENTIC',
    GEO_FAIL: 'PHYSICAL_FAIL',
    GEO_UNCERTAIN: 'PHYSICAL_UNREADABLE',
  }
  // 정상 응답 여부와 표시할 판정값의 존재만 확인합니다. 오류를 정품/가품 판정으로 바꾸지 않습니다.
  if (body.success !== true || typeof body.verdict !== 'string' || !Object.hasOwn(displayStatuses, body.verdict)) return displayError('CONTRACT')
  const status = displayStatuses[body.verdict]
  return { kind: 'result', status, registryStatus: 'NOT_CHECKED', reasons: status === 'AUTHENTIC' ? [] : [status], response: raw }
}
export function displayCopy(state: DisplayState): { title: string; subtitle: string; tone: 'good' | 'warning' | 'error' | 'processing' } {
  if (state.kind === 'processing') return { title: '검증 중', subtitle: '서버 판독 결과를 기다리고 있습니다.', tone: 'processing' }
  if (state.kind === 'idle') return { title: '검증을 시작해 주세요', subtitle: '아직 서버 판독 결과가 없습니다.', tone: 'warning' }
  if (state.kind === 'error') {
    const copies: Record<DisplayError, [string, string]> = {
      REFERENCE_PENDING: ['등록 기록 확인이 필요합니다', '발행·등록 기록이 준비되지 않아 검증을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.'],
      NETWORK: ['서버 결과를 받지 못했습니다', '연결 상태를 확인한 뒤 다시 시도해 주세요.'],
      HTTP: ['서버 요청을 완료하지 못했습니다', '서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'],
      JSON: ['서버 응답을 확인할 수 없습니다', '응답 형식에 문제가 있습니다. 다시 시도해 주세요.'],
      CONTRACT: ['서버 최종 결과를 확인할 수 없습니다', '필요한 판독 결과가 없거나 응답 내용이 일치하지 않습니다.'],
      INTEGRITY: ['전송된 이미지를 확인할 수 없습니다', '이미지 전송 검증에 실패했습니다. 다시 촬영해 주세요.'],
      CAPTURE: ['촬영 이미지를 준비하지 못했습니다', '카메라 상태를 확인한 뒤 다시 촬영해 주세요.'],
      PIPELINE: ['검증 요청을 완료하지 못했습니다', '검증 처리 중 오류가 발생했습니다. 다시 시도해 주세요.'],
    }
    const [title, subtitle] = copies[state.code]
    return { title, subtitle, tone: state.code === 'REFERENCE_PENDING' ? 'warning' : 'error' }
  }
  switch (state.status) {
    case 'AUTHENTIC': return { title: '정품입니다', subtitle: '실물 지오코드가 확인되었습니다.', tone: 'good' }
    case 'PHYSICAL_FAIL': return { title: '가품이 의심됩니다', subtitle: '실물 보안코드가 확인되지 않았습니다. 재촬영 후에도 같은 결과가 나오면 본사 정밀판독을 요청해 주세요.', tone: 'error' }
    case 'PHYSICAL_UNREADABLE': return { title: '판정할 수 없습니다', subtitle: '정품 여부를 판단하지 못했습니다. 다시 촬영해 주세요.', tone: 'warning' }
    default: {
      const reason = state.registryStatus === 'UNREGISTERED' ? '공식 등록 정보를 확인하지 못했습니다.'
        : state.registryStatus === 'SESSION_INVALID' ? '검증 세션이 유효하지 않습니다. 검증을 다시 시작해 주세요.'
        : state.registryStatus === 'REGISTRY_INCOMPLETE' ? '발행·출고·소유권 이력의 시간 정보를 확인하지 못했습니다.'
        : '공식 등록 정보의 인증 조건을 충족하지 못했습니다.'
      return { title: '정품 인증을 완료하지 못했습니다', subtitle: `실물 보안코드는 확인되었습니다. ${reason}`, tone: 'warning' }
    }
  }
}
// Old requests may finish after retry/navigation. Only the current request may publish.
export function createRequestGate() {
  let generation = 0
  return { begin: () => ++generation, cancel: () => { ++generation }, current: (id: number) => id === generation }
}
