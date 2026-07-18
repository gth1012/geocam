// CameraScreen.tsx v4.7
// GCS-CAMERA-UNIFIED-001 STEP 3
// 수정: captureInProgressRef 추가 → stopPreview Race Condition 해결
// capturePhoto 완료 후 명시적 stopPreview → cleanup은 조건부 실행

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { API_BASE_URL } from '../api/client'
import { Filesystem } from '@capacitor/filesystem'
import type { CameraScreenProps } from '../types/app.types'
import { registerPlugin, Capacitor } from '@capacitor/core'
const YuvCamera = registerPlugin('YuvCamera')

// ── 상수 ────────────────────────────────────────────────────────────────────
const GUIDE_H_RATIO         = 0.55
const GUIDE_W_MAX_RATIO     = 0.88
const GUIDE_SAFE_AREA_RATIO = 0.94
const DEBUG_CROP_LOG        = true
const NEO_API_BASE          = 'https://neo-api.artionchain.com/api'
void API_BASE_URL

// ── CameraScreen v4.7 ───────────────────────────────────────────────────────
const CameraScreen = ({
  safeGoHome, runPipeline, BackArrow, sessionToken, nonce, dinaId, qrData, authToken,
  setCapturedImage, setConfidence, setMatchScore, setVerifyStatus, setRecordInfo,
  setErrorCode, setNetworkError, setProcessing, navigateToScreen, cameraError, setCameraError, selectedCardProfile,
}: CameraScreenProps) => {
  const { t } = useTranslation()

  // ── refs ─────────────────────────────────────────────────────────────────
  const canvasRef              = useRef<HTMLCanvasElement>(null)
  const captureLockedRef       = useRef(false)
  const cameraViewRef          = useRef<HTMLDivElement>(null)
  const captureInProgressRef   = useRef(false)

  // ── state ─────────────────────────────────────────────────────────────────
  const [previewReady, setPreviewReady]         = useState(false)
  const [capturing, setCapturing]               = useState(false)
  const [showGuideOverlay, setShowGuideOverlay] = useState(true)
  const [cameraViewSize, setCameraViewSize]     = useState({ w: 0, h: 0 })

  const isSignalOnlyMode = !dinaId && !qrData
  void sessionToken; void nonce; void runPipeline
  void setConfidence; void setMatchScore; void setRecordInfo; void setErrorCode
  void safeGoHome; void cameraError; void authToken; void qrData

  // ── resetCaptureLock ──────────────────────────────────────────────────────
  const resetCaptureLock = useCallback((reason: string) => {
    captureLockedRef.current = false
    if (DEBUG_CROP_LOG) console.log('[captureLock] reset:', reason)
  }, [])

  useEffect(() => {
    resetCaptureLock('mount')
    return () => { captureLockedRef.current = true }
  }, [resetCaptureLock])

  // ── cameraView 크기 측정 ──────────────────────────────────────────────────
  useEffect(() => {
    const el = cameraViewRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setCameraViewSize({ w: Math.round(width), h: Math.round(height) })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ── guideBox 계산 ─────────────────────────────────────────────────────────
  const guideBox = useMemo(() => {
    const { w: vw, h: vh } = cameraViewSize
    if (!vw || !vh) return { x: 0, y: 0, w: 0, h: 0 }
    const maxGuideH = vh * GUIDE_H_RATIO
    const maxGuideW = vw * GUIDE_W_MAX_RATIO
    let guideH = maxGuideH
    let guideW = guideH / selectedCardProfile.aspectHOverW
    if (guideW > maxGuideW) {
      guideW = maxGuideW
      guideH = guideW * selectedCardProfile.aspectHOverW
    }
    return {
      x: Math.round((vw - guideW) / 2),
      y: Math.round((vh - guideH) / 2),
      w: Math.round(guideW),
      h: Math.round(guideH),
    }
  }, [selectedCardProfile, cameraViewSize])

  const safeAreaBox = useMemo(() => {
    if (!guideBox.w || !guideBox.h) return { x: 0, y: 0, w: 0, h: 0 }
    const safeW = guideBox.w * GUIDE_SAFE_AREA_RATIO
    const safeH = guideBox.h * GUIDE_SAFE_AREA_RATIO
    return {
      x: guideBox.x + (guideBox.w - safeW) / 2,
      y: guideBox.y + (guideBox.h - safeH) / 2,
      w: safeW,
      h: safeH,
    }
  }, [guideBox])

  // ── WebView 배경 투명 처리 (STEP 3-A-1) ─────────────────────────────────
  // body / html / #root 전체 !important 적용 → CSS background shorthand 우선순위 극복
  // cleanup에서 복원 → 다른 화면 배경 영향 없음
  useEffect(() => {
    const body = document.body
    const html = document.documentElement
    const root = document.getElementById('root')

    body.style.setProperty('background', 'transparent', 'important')
    body.style.setProperty('background-color', 'transparent', 'important')

    html.style.setProperty('background', 'transparent', 'important')
    html.style.setProperty('background-color', 'transparent', 'important')

    root?.style.setProperty('background', 'transparent', 'important')
    root?.style.setProperty('background-color', 'transparent', 'important')

    console.log('[GeoCam] WEB_HTML_TRANSPARENT_APPLIED')

    return () => {
      body.style.removeProperty('background')
      body.style.removeProperty('background-color')

      html.style.removeProperty('background')
      html.style.removeProperty('background-color')

      root?.style.removeProperty('background')
      root?.style.removeProperty('background-color')

      console.log('[GeoCam] WEB_HTML_TRANSPARENT_REMOVED')
    }
  }, [])

  // ── CameraX Preview 시작/종료 ─────────────────────────────────────────────
  useEffect(() => {
    console.log('[UNIFIED-001] startPreview() 호출')
    ;(YuvCamera as any).startPreview()
      .then((r: any) => {
        console.log('[UNIFIED-001] startPreview 완료:', JSON.stringify(r))
        setPreviewReady(true)
        setCameraError(null)
      })
      .catch((e: any) => {
        console.error('[UNIFIED-001] startPreview 실패:', e)
        setCameraError('카메라 시작 실패입니다.')
      })

    return () => {
      if (!captureInProgressRef.current) {
        console.log('[UNIFIED-001] cleanup stopPreview() 호출')
        ;(YuvCamera as any).stopPreview()
          .then((r: any) => console.log('[UNIFIED-001] stopPreview 완료:', r))
          .catch((e: any) => console.error('[UNIFIED-001] stopPreview 실패:', e))
      } else {
        console.log('[UNIFIED-001] cleanup skip stopPreview (captureInProgress=true)')
      }
    }
  }, [])

  // ── capturePhoto v4.7 ─────────────────────────────────────────────────────
  const capturePhoto = useCallback(async (source: 'manual' = 'manual') => {
    const triggerTime = Date.now()
    console.log(`[CAPTURE] ENTER source=${source} t=${triggerTime}`)

    if (captureLockedRef.current) {
      console.log('[CAPTURE] SKIP_ALREADY_LOCKED')
      return
    }
    captureLockedRef.current = true
    captureInProgressRef.current = true
    setCapturing(true)

    try {
      console.log('[CAPTURE] previewView:', JSON.stringify({ w: cameraViewSize.w, h: cameraViewSize.h }))
      console.log('[CAPTURE] guideBox:', JSON.stringify(guideBox))

      const callTime = Date.now()
      console.log(`[CAPTURE] capturePhotoFile() 호출 t=${callTime} delay=${callTime - triggerTime}ms`)
      const photoResult = await (YuvCamera as any).capturePhotoFile()
      const doneTime = Date.now()
      console.log(`[CAPTURE] capturePhotoFile() 완료 t=${doneTime} elapsed=${doneTime - callTime}ms`)

      console.log('[CAPTURE] path        :', photoResult.path)
      console.log('[CAPTURE] size        :', photoResult.size)
      console.log('[CAPTURE] jpegW       :', photoResult.width)
      console.log('[CAPTURE] jpegH       :', photoResult.height)
      console.log('[CAPTURE] exifRotation:', photoResult.exifRotation)

      console.log('[CROP_CHECK]', JSON.stringify({
        previewView:   { width: cameraViewSize.w, height: cameraViewSize.h },
        guideBox,
        capturedPhoto: { width: photoResult.width, height: photoResult.height, exifRotation: photoResult.exifRotation },
      }))

      const displayUri = Capacitor.convertFileSrc(photoResult.path)
      setCapturedImage(displayUri)

      console.log('[STEP3] 파일 읽기 시작')
      const fileData = await Filesystem.readFile({ path: photoResult.path })
      const base64Str = typeof fileData.data === 'string' ? fileData.data : ''
      const binaryStr = atob(base64Str)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

      const hashBuf = await crypto.subtle.digest('SHA-256', bytes)
      const clientSha256 = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0')).join('')
      console.log('[STEP3] clientSha256 :', clientSha256)
      console.log('[STEP3] clientSize   :', photoResult.size)

      const blob = new Blob([bytes], { type: photoResult.mimeType })
      const formData = new FormData()
      formData.append('image', blob, 'geo_capture.jpg')
      formData.append('client_sha256', clientSha256)
      formData.append('client_file_size', String(photoResult.size))
      // ── STEP 4-A: 촬영 메타데이터 전달 ──────────────────────────────────
      formData.append('preview_w',          String(cameraViewSize.w))
      formData.append('preview_h',          String(cameraViewSize.h))
      formData.append('guide_x',            String(guideBox.x))
      formData.append('guide_y',            String(guideBox.y))
      formData.append('guide_w',            String(guideBox.w))
      formData.append('guide_h',            String(guideBox.h))
      formData.append('image_w',            String(photoResult.width))
      formData.append('image_h',            String(photoResult.height))
      formData.append('exif_rotation',      String(photoResult.exifRotation ?? 0))
      formData.append('preview_scale_type', 'FILL_CENTER')
      console.log('[STEP4A] 메타데이터 전달:', JSON.stringify({
        preview: { w: cameraViewSize.w, h: cameraViewSize.h },
        guide:   { x: guideBox.x, y: guideBox.y, w: guideBox.w, h: guideBox.h },
        image:   { w: photoResult.width, h: photoResult.height },
        exifRotation: photoResult.exifRotation ?? 0,
        scaleType: 'FILL_CENTER',
      }))
      // ─────────────────────────────────────────────────────────────────────

      console.log('[STEP3] multipart 전송 시작')
      const uploadRes = await fetch(`${NEO_API_BASE}/geocam/physical/verify-file`, {
        method: 'POST',
        body: formData,
      })

      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({}))
        throw new Error(`verify-file error: ${uploadRes.status} ${JSON.stringify(errBody)}`)
      }

      const uploadResult = await uploadRes.json()
      console.log('[STEP3] 서버 응답    :', JSON.stringify(uploadResult))
      console.log('[STEP3] transferIntegrity:', uploadResult.transferIntegrity)
      console.log('[STEP3] clientSha256 :', uploadResult.clientSha256)
      console.log('[STEP3] serverSha256 :', uploadResult.serverSha256)
      console.log('[STEP3] serverSize   :', uploadResult.serverFileSize)
      console.log('[STEP3] verdict      :', uploadResult.verdict)

      if (uploadResult.transferIntegrity === false) {
        setVerifyStatus('INSUFFICIENT_DATA')
      } else if (uploadResult.verdict === 'SIGNAL_PRESENT') {
        setVerifyStatus('PRESENT')
      } else if (uploadResult.verdict === 'SIGNAL_UNCERTAIN') {
        setVerifyStatus('INSUFFICIENT_DATA')
      } else {
        setVerifyStatus('ABSENT')
      }

      console.log('[CAPTURE] stopPreview() 명시적 호출 (navigate 전)')
      await (YuvCamera as any).stopPreview()
        .then((r: any) => console.log('[CAPTURE] stopPreview 완료:', r))
        .catch((e: any) => console.warn('[CAPTURE] stopPreview warn:', e))

      captureInProgressRef.current = false
      setCapturing(false)
      navigateToScreen('result')

    } catch (e) {
      console.error('[CAPTURE] error:', e)

      await (YuvCamera as any).stopPreview()
        .catch((se: any) => console.warn('[CAPTURE] stopPreview(error path) warn:', se))

      captureInProgressRef.current = false
      setNetworkError(true)
      setVerifyStatus('INSUFFICIENT_DATA')
      resetCaptureLock('capture_error')
      setCapturing(false)
      navigateToScreen('result')
    }
  }, [cameraViewSize, guideBox, setCapturedImage, setVerifyStatus, setNetworkError, navigateToScreen, resetCaptureLock])

  const handleBack = useCallback(() => {
    navigateToScreen('sizeSelect')
  }, [navigateToScreen])

  const handleGuideConfirm = useCallback(() => {
    setShowGuideOverlay(false)
    resetCaptureLock('guide_confirm')
  }, [resetCaptureLock])

  const guideColor = 'rgba(255,255,255,0.6)'
  const cornerStyle = (pos: object) => ({
    position: 'absolute' as const,
    width: '36px',
    height: '36px',
    ...pos,
  })

  const guides = [
    { num: '01', title: '카드를 가이드박스 안에 맞춰주세요', desc: '기울어지지 않고 수평으로 놓아주세요' },
    { num: '02', title: '카드 전체가 가이드 안에 들어오도록 맞춰주세요', desc: '카드 테두리가 가이드 안쪽에 있어야 합니다' },
    { num: '03', title: '빛이 충분한 환경에서 촬영하세요', desc: '어두운 곳에서 카드를 직접 비추지 않도록 각도를 조정해주세요' },
    { num: '04', title: '20~25cm 거리에서 촬영하세요', desc: '너무 가까우면 흔들릴 수 있습니다' },
    { num: '05', title: '흔들리지 않도록 촬영하세요', desc: '촬영 버튼을 누른 후 잠시 기다려주세요' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'transparent', display: 'flex', flexDirection: 'column' }}>

      {/* 헤더 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={handleBack} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <BackArrow />
        </button>
        <div style={{ textAlign: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '14px', fontWeight: '300', letterSpacing: '0.12em' }}>
            {isSignalOnlyMode ? '정품 신호 검출' : t('capture.title')}
          </span>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px', letterSpacing: '0.08em', marginTop: '2px' }}>
            {selectedCardProfile.name} · {selectedCardProfile.widthMm}×{selectedCardProfile.heightMm}mm
          </div>
        </div>
        <button onClick={() => setShowGuideOverlay(true)} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: '15px' }}>
          ?
        </button>
      </div>

      {/* 카메라 영역 */}
      <div ref={cameraViewRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* 로딩 스피너 */}
        {!previewReady && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
            <div style={{ position: 'relative', width: '72px', height: '72px', marginBottom: '20px' }}>
              <svg viewBox="0 0 72 72" style={{ width: '72px', height: '72px', transform: 'rotate(-90deg)', animation: 'spin 1.5s linear infinite' }}>
                <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(167,139,250,0.2)" strokeWidth="4" />
                <circle cx="36" cy="36" r="30" fill="none" stroke="#a78bfa" strokeWidth="4" strokeDasharray="60 130" strokeLinecap="round" />
              </svg>
              <style>{`@keyframes spin { to { transform: rotate(270deg); } }`}</style>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', fontWeight: '300', letterSpacing: '0.05em', marginBottom: '8px' }}>카메라 확인 중입니다</p>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px', fontWeight: '300', letterSpacing: '0.03em' }}>잠시만 기다려주세요</p>
          </div>
        )}

        {/* 가이드박스 오버레이 */}
        {guideBox.w > 0 && (
          <div style={{ position: 'absolute', left: `${guideBox.x}px`, top: `${guideBox.y}px`, width: `${guideBox.w}px`, height: `${guideBox.h}px`, pointerEvents: 'none', zIndex: 10 }}>
            <div style={{ ...cornerStyle({ top: 0, left: 0 }), borderTop: `2px solid ${guideColor}`, borderLeft: `2px solid ${guideColor}`, borderTopLeftRadius: '8px' }} />
            <div style={{ ...cornerStyle({ top: 0, right: 0 }), borderTop: `2px solid ${guideColor}`, borderRight: `2px solid ${guideColor}`, borderTopRightRadius: '8px' }} />
            <div style={{ ...cornerStyle({ bottom: 0, left: 0 }), borderBottom: `2px solid ${guideColor}`, borderLeft: `2px solid ${guideColor}`, borderBottomLeftRadius: '8px' }} />
            <div style={{ ...cornerStyle({ bottom: 0, right: 0 }), borderBottom: `2px solid ${guideColor}`, borderRight: `2px solid ${guideColor}`, borderBottomRightRadius: '8px' }} />
            {safeAreaBox.w > 0 && (
              <div style={{ position: 'absolute', left: `${safeAreaBox.x - guideBox.x}px`, top: `${safeAreaBox.y - guideBox.y}px`, width: `${safeAreaBox.w}px`, height: `${safeAreaBox.h}px`, border: '1px dashed rgba(255,255,255,0.18)', borderRadius: '4px', pointerEvents: 'none' }} />
            )}
            <div style={{ position: 'absolute', top: '-22px', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', letterSpacing: '0.08em' }}>
                {selectedCardProfile.widthMm}×{selectedCardProfile.heightMm}mm
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 하단 촬영 버튼 */}
      <div style={{ padding: '24px', paddingBottom: 'max(40px, env(safe-area-inset-bottom))', background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', marginBottom: '8px', textAlign: 'center', letterSpacing: '0.05em' }}>
          {capturing ? '처리 중...' : '카드를 가이드에 맞춘 후 촬영'}
        </p>
        <button
          onClick={() => capturePhoto('manual')}
          disabled={!previewReady || capturing}
          style={{ width: '72px', height: '72px', borderRadius: '50%', background: previewReady && !capturing ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.2)', border: '3px solid rgba(255,255,255,0.2)', cursor: previewReady && !capturing ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.1s' }}
        >
          {capturing
            ? <svg width="28" height="28" viewBox="0 0 32 32" fill="none" style={{ animation: 'spin 1s linear infinite' }}><circle cx="16" cy="16" r="14" stroke="#0a0a0c" strokeWidth="2" strokeDasharray="8 4" /></svg>
            : <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: previewReady ? '#0a0a0c' : 'rgba(0,0,0,0.2)' }} />
          }
        </button>
      </div>

      {/* 촬영 가이드 오버레이 */}
      {showGuideOverlay && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', maxHeight: '80vh', overflowY: 'auto', background: '#111', borderRadius: '20px 20px 0 0', padding: '24px', paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ color: 'rgba(255,255,255,0.85)', fontSize: '16px', fontWeight: '400', letterSpacing: '0.06em', margin: 0 }}>촬영 전 확인사항</h2>
              <button onClick={() => setShowGuideOverlay(false)} style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {guides.map((item) => (
                <div key={item.num} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px' }}>{item.num}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', fontWeight: '400', marginBottom: '2px' }}>{item.title}</p>
                    <p style={{ color: 'rgba(234,179,8,0.75)', fontSize: '11px', lineHeight: '1.5', fontWeight: '300' }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={handleGuideConfirm}
              style={{ width: '100%', padding: '15px', borderRadius: '14px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: '15px', fontWeight: '300', letterSpacing: '0.06em', cursor: 'pointer' }}
            >
              확인 후 촬영 시작
            </button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default CameraScreen