import { useCallback, useEffect, useRef, useState } from 'react'
import { registerPlugin } from '@capacitor/core'

type Point = { x: number; y: number }
type Handle = { remove: () => Promise<void> }
type CornerEvent = { token: string; frameId: number; capturedAt: number; status: string; points: Point[]; copyMs: number; detectMs: number }
type Config = { enabled: boolean; preview: { w: number; h: number }; guide: { x: number; y: number; w: number; h: number } }
const native = registerPlugin<{
  addListener: (event: 'cornerPoc', handler: (event: CornerEvent) => void) => Promise<Handle>
  setCornerPocConfig: (config: Record<string, unknown>) => Promise<void>
}>('YuvCamera')

// Display only; never returns readiness or modifies capture state.
export function useCornerPoc({ enabled, preview, guide }: Config) {
  const [points, setPoints] = useState<Point[] | null>(null)
  const allowed = useRef(false)
  const allowedSince = useRef(Infinity)
  const expire = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stable = useRef<{ count: number; previous: Point[] | null }>({ count: 0, previous: null })
  const hide = useCallback(() => {
    if (expire.current !== null) clearTimeout(expire.current)
    expire.current = null
    stable.current = { count: 0, previous: null }
    setPoints(null)
  }, [])
  const setTiltAllowed = useCallback((ok: boolean) => {
    // Caller uses the exact same unrounded <= AUTO_CAPTURE_TILT_MAX_DEG expression.
    if (ok && !allowed.current) allowedSince.current = Date.now()
    allowed.current = ok
    if (!ok) { allowedSince.current = Infinity; hide() }
  }, [hide])

  useEffect(() => {
    hide()
    if (!enabled || preview.w <= 0 || preview.h <= 0 || guide.w <= 0 || guide.h <= 0) return
    const token = `corner-${Date.now()}-${Math.random().toString(36).slice(2)}`
    let disposed = false
    let listener: Handle | null = null
    let lastFrame = -1
    let samples = 0
    const configure = async () => {
      const handle = await native.addListener('cornerPoc', (event) => {
        if (disposed || event.token !== token || event.frameId <= lastFrame) return
        lastFrame = event.frameId
        const age = Date.now() - event.capturedAt
        if (!allowed.current || event.capturedAt <= allowedSince.current || age < 0 || age >= 250 || event.status !== 'VALID') { hide(); return }
        const p = event.points
        if (!Array.isArray(p) || p.length !== 4 || p.some(q => !Number.isFinite(q.x) || !Number.isFinite(q.y) || q.x < 0 || q.y < 0 || q.x > preview.w || q.y > preview.h)) { hide(); return }
        const prev = stable.current.previous
        const near = prev !== null && p.every((q, i) => Math.hypot(q.x - prev[i].x, q.y - prev[i].y) <= Math.min(guide.w, guide.h) * 0.08)
        stable.current = { count: near ? stable.current.count + 1 : 1, previous: p }
        if (!near) setPoints(null)
        if (expire.current !== null) clearTimeout(expire.current)
        expire.current = setTimeout(hide, Math.max(1, 250 - age))
        if (stable.current.count >= 3) setPoints(p)
        if (++samples % 24 === 0) console.debug('[CORNER_POC]', { copyMs: event.copyMs, detectMs: event.detectMs, ageMs: age })
      })
      if (disposed) { await handle.remove(); return }
      listener = handle
      await native.setCornerPocConfig({ token, enabled: true, previewW: preview.w, previewH: preview.h, guideX: guide.x, guideY: guide.y, guideW: guide.w, guideH: guide.h })
      if (disposed) await native.setCornerPocConfig({ token, enabled: false })
    }
    void configure().catch(() => { if (!disposed) hide() })
    return () => {
      disposed = true
      hide()
      void listener?.remove().catch(() => {})
      void native.setCornerPocConfig({ token, enabled: false }).catch(() => {})
    }
  }, [enabled, preview.w, preview.h, guide.x, guide.y, guide.w, guide.h, hide])

  const path = points?.map((p, i) => {
    const previous = points[(i + 3) % 4], next = points[(i + 1) % 4]
    const toward = (q: Point) => {
      const length = Math.hypot(q.x - p.x, q.y - p.y)
      const t = Math.min(26 / Math.max(length, 1), 0.2)
      return `${p.x + (q.x - p.x) * t},${p.y + (q.y - p.y) * t}`
    }
    return `M${toward(previous)} L${p.x},${p.y} L${toward(next)}`
  }).join(' ')
  const overlay = enabled && allowed.current && path ? (
    <svg aria-hidden="true" width={preview.w} height={preview.h} viewBox={`0 0 ${preview.w} ${preview.h}`}
      style={{ position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 11, overflow: 'hidden' }}>
      <path d={path} fill="none" stroke="black" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
      <path d={path} fill="none" stroke="#22d3ee" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  ) : null
  return { setTiltAllowed, overlay }
}
