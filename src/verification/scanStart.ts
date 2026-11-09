import { displayError, type DisplayState } from './display'

export interface ScanSession {
  success: true
  session_token: string
  nonce: string
  dina_id: string
  status: 'UNCLAIMED' | 'CLAIMED'
}
export type ScanStartResult = { ok: true; session: ScanSession } | {
  ok: false; errorCode: string; httpStatus: number; displayState: DisplayState
}
const object = (raw: unknown): Record<string, unknown> => raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
export function parseScanStart(raw: unknown, httpStatus: number, dinaId: string): ScanStartResult {
  const body = object(raw), error = object(body.error)
  const code = typeof error.code === 'string' ? error.code : typeof body.error === 'string' ? body.error : 'SCAN_START_FAILED'
  const httpOK = httpStatus >= 200 && httpStatus < 300
  if (!httpOK || body.success !== true) {
    const pending = httpStatus === 409 && body.success === false && ['REFERENCE_TIME_NOT_READY', 'VERIFICATION_STATE_NOT_READY'].includes(code)
    return { ok: false, errorCode: code, httpStatus, displayState: displayError(pending ? 'REFERENCE_PENDING' : httpOK ? 'CONTRACT' : 'HTTP', httpStatus) }
  }
  if (body.dina_id !== dinaId || typeof body.status !== 'string' || !['UNCLAIMED', 'CLAIMED'].includes(body.status) ||
      typeof body.session_token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.session_token) ||
      typeof body.nonce !== 'string' || !/^[0-9a-f]{32}$/i.test(body.nonce)) {
    return { ok: false, errorCode: 'SCAN_START_CONTRACT_INVALID', httpStatus, displayState: displayError('CONTRACT') }
  }
  return { ok: true, session: { success: true, session_token: body.session_token, nonce: body.nonce, dina_id: dinaId, status: body.status as ScanSession['status'] } }
}
export async function requestScanStart(apiBase: string, dinaId: string, deviceId: string, signal?: AbortSignal): Promise<ScanStartResult> {
  const response = await fetch(apiBase + '/geocam/scan/start', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dina_id: dinaId, device_fingerprint: deviceId }),
  })
  let body: unknown
  try { body = await response.json() } catch {
    return { ok: false, errorCode: 'SCAN_START_RESPONSE_INVALID', httpStatus: response.status, displayState: displayError('JSON', response.status) }
  }
  return parseScanStart(body, response.status, dinaId)
}
