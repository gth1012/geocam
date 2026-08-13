// CameraScreen.tsx v4.11
// SC-4 Preview 좌표계 버그 수정 (2026-08-04)
// 원인: previewW/H로 cameraViewSize(하단 촬영버튼 영역만큼 잘린 flex 자식 div,
//      360x595)를 사용했으나, 서버 calculateFillCenterCrop()과 네이티브
//      Java computeGuideRectInFrame()은 이 값을 "실제 PreviewView 전체 크기"로
//      취급함. 실제 PreviewView는 MATCH_PARENT(MainActivity.java)라 화면 전체를
//      차지하므로 진짜 크기는 1080x2340px(DPR=3 환산 360x780dp) — 185dp 차이가
//      FILL_CENTER offsetY 오계산 → crop top 약 483px 오차로 이어짐.
//      (SC-4 round2 10장 실측: center displacement 평균 484.6px/23.96%,
//       Python 시뮬레이션으로 780 적용 시 38.5px/1.91%까지 감소 사전검증 완료)
// 수정: startPreview() 응답에 이미 포함되어 있던 viewPortW/viewPortH(네이티브
//      실측값, 기존엔 로그만 찍고 버려지던 값)를 devicePixelRatio로 나눠
//      nativePreviewSize로 저장, formData 전송 및 setGuideBox() 네이티브 전달에
//      이 값을 사용하도록 교체. 780 하드코딩 없음(항상 실측값 사용).
// 무수정: guideBox 계산식(cameraViewSize 그대로 사용, 시뮬레이션에서 오차제거
//      확인된 상태 유지) / calculateFillCenterCrop()(서버, MATCH 검증 완료) /
//      YuvCameraPlugin.java / JSX 렌더링 / Perspective / Cell / D안 로직
// 이전(v4.10): LT-GUIDEBOX-VISUAL-MISMATCH-001 — visualGuideBox/visualMinBox/
//      safeAreaBox 제거, 화면 표시를 guideBox 하나로 SSOT 통합
// 이전(v4.9): selectedCardProfile 전체 제거, 가이드박스 비율을 54.0:85.6mm(1.5852)
//      고정값으로 교체. SizeSelectScreen 폐기에 따라 handleBack() → certSelect로 변경
//      헤더/가이드박스의 카드사이즈 표시 텍스트 제거
// 이전(v4.8): GCS-AUTO-CAPTURE-001 STEP 1 - autoCaptureReady 리스너 분리

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

// [한글 주석] LT-AUTOCAP-002: 카드 종류 선택 폐기, 54.0x85.6mm 고정 비율
// (GeoStudio geocode-block-insert.service.ts CARD_W_MM/CARD_H_MM 인코더 고정값과 완전 일치)
const CARD_ASPECT_H_OVER_W = 85.6 / 54.0

// ── CameraScreen v4.11 ──────────────────────────────────────────────────────

const CameraScreen = ({
  safeGoHome, runPipeline, BackArrow, sessionToken, nonce, dinaId, qrData, authToken,
  setCapturedImage, setConfidence, setMatchScore, setVerifyStatus, setRecordInfo,
  setErrorCode, setNetworkError, setProcessing, navigateToScreen, cameraError, setCameraError,
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
  // SC-4 수정: 네이티브 PreviewView 실제 크기 (startPreview() 응답의 viewPortW/H를
  // devicePixelRatio로 환산, 780 등 하드코딩 없음 — 항상 기기 실측값)
  const [nativePreviewSize, setNativePreviewSize] = useState({ w: 0, h: 0 })

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

  // ── guideBox 계산 (LT-AUTOCAP-002: 54:85.6mm 고정 비율, 카드종류 선택 없음) ──
  // LT-GUIDEBOX-VISUAL-MISMATCH-001: 화면표시/서버전송/자동촬영판단 3곳 모두
  // 이 guideBox 하나만 참조하는 SSOT (Single Source of Truth) — 계산식 무수정
  // (SC-4 수정 범위 밖: cameraViewSize 기준 그대로 유지, 시뮬레이션에서 오차제거 확인됨)
  const guideBox = useMemo(() => {
    const { w: vw, h: vh } = cameraViewSize
    if (!vw || !vh) return { x: 0, y: 0, w: 0, h: 0 }
    const maxGuideH = vh * GUIDE_H_RATIO
    const maxGuideW = vw * GUIDE_W_MAX_RATIO
    let guideH = maxGuideH
    let guideW = guideH / CARD_ASPECT_H_OVER_W
    if (guideW > maxGuideW) {
      guideW = maxGuideW
      guideH = guideW * CARD_ASPECT_H_OVER_W
    }
    return {
      x: Math.round((vw - guideW) / 2),
      y: Math.round((vh - guideH) / 2),
      w: Math.round(guideW),
      h: Math.round(guideH),
    }
  }, [cameraViewSize])

  // ── WebView 배경 투명 처리 ────────────────────────────────────────────────
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

  // ── CameraX Preview 시작/종료 (카메라만 담당) ─────────────────────────────
  useEffect(() => {
    console.log('[UNIFIED-001] startPreview() 호출')
    ;(YuvCamera as any).startPreview()
      .then((r: any) => {
        console.log('[UNIFIED-001] startPreview 완료:', JSON.stringify(r))
        // SC-4 수정: 네이티브가 실측한 진짜 PreviewView 크기(viewPortW/H, px)를
        // devicePixelRatio로 dp 환산해서 저장 — 하드코딩 없음, 항상 실측값 사용
        if (r?.viewPortW && r?.viewPortH) {
          const dpr = window.devicePixelRatio || 1
          const nw = r.viewPortW / dpr
          const nh = r.viewPortH / dpr
          console.log('[SC4-FIX] nativePreviewSize 계산:', JSON.stringify({ viewPortW: r.viewPortW, viewPortH: r.viewPortH, dpr, nw, nh }))
          setNativePreviewSize({ w: nw, h: nh })
        } else {
          console.warn('[SC4-FIX] startPreview 응답에 viewPortW/H 없음, nativePreviewSize 미설정')
        }
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

  // ── capturePhoto v4.11 (SC-4: preview_w/h 전송값만 nativePreviewSize로 교체) ─
  const capturePhoto = useCallback(async (source: 'manual' | 'auto' = 'manual') => {
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
      console.log('[CAPTURE] previewView(cameraViewSize, guideBox기준):', JSON.stringify({ w: cameraViewSize.w, h: cameraViewSize.h }))
      console.log('[CAPTURE] nativePreviewSize(서버전송기준):', JSON.stringify(nativePreviewSize))
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
        previewView:   { width: nativePreviewSize.w, height: nativePreviewSize.h },
        guideBox,
        capturedPhoto: { width: photoResult.width, height: photoResult.height, exifRotation: photoResult.exifRotation },
      }))

      const uploadUri = Capacitor.convertFileSrc(photoResult.path)

      // ── 즉시 화면 전환 (체감 촬영시간 0.8초) ────────────────────────────
      setCapturedImage(uploadUri)

      console.log('[CAPTURE] stopPreview() 즉시 호출')
      await (YuvCamera as any).stopPreview()
        .then((r: any) => console.log('[CAPTURE] stopPreview 완료:', r))
        .catch((e: any) => console.warn('[CAPTURE] stopPreview warn:', e))

      captureInProgressRef.current = false
      setCapturing(false)
      navigateToScreen('result')
      // ── 화면 전환 완료, 백그라운드 업로드 시작 ───────────────────────────

      console.log('[STEP3] 파일 읽기 시작 (백그라운드)')
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
      // SC-4 수정: preview_w/h는 cameraViewSize(하단버튼만큼 잘린 영역) 대신
      // nativePreviewSize(네이티브 PreviewView 실측 전체크기)를 전송
      formData.append('preview_w',          String(nativePreviewSize.w))
      formData.append('preview_h',          String(nativePreviewSize.h))
      formData.append('guide_x',            String(guideBox.x))
      formData.append('guide_y',            String(guideBox.y))
      formData.append('guide_w',            String(guideBox.w))
      formData.append('guide_h',            String(guideBox.h))
      formData.append('image_w',            String(photoResult.width))
      formData.append('image_h',            String(photoResult.height))
      formData.append('exif_rotation',      String(photoResult.exifRotation ?? 0))
      formData.append('preview_scale_type', 'FILL_CENTER')
      console.log('[STEP4A] 메타데이터 전달:', JSON.stringify({
        preview: { w: nativePreviewSize.w, h: nativePreviewSize.h },
        guide:   { x: guideBox.x, y: guideBox.y, w: guideBox.w, h: guideBox.h },
        image:   { w: photoResult.width, h: photoResult.height },
        exifRotation: photoResult.exifRotation ?? 0,
        scaleType: 'FILL_CENTER',
      }))

      console.log('[STEP3] multipart 전송 시작')
      const uploadRes = await fetch(`${NEO_API_BASE}/geocode-block/detect`, {
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
  }, [cameraViewSize, nativePreviewSize, guideBox, setCapturedImage, setVerifyStatus, setNetworkError, navigateToScreen, resetCaptureLock])

  // ── setGuideBox: 가이드박스 확정 시 Java로 전달 (GCS-AUTO-CAPTURE-001) ───
  // SC-4 수정: previewW/H를 nativePreviewSize(네이티브 실측)로 교체.
  // guideX/Y/W/H는 여전히 guideBox(cameraViewSize 기준) 그대로 — 무수정.
  useEffect(() => {
    if (!guideBox.w || !guideBox.h || !nativePreviewSize.w || !nativePreviewSize.h) return
    console.log('[SET_GUIDE_BOX] 전달:', JSON.stringify({ previewW: nativePreviewSize.w, previewH: nativePreviewSize.h, ...guideBox }))
    ;(YuvCamera as any).setGuideBox({
      previewW: nativePreviewSize.w,
      previewH: nativePreviewSize.h,
      guideX:   guideBox.x,
      guideY:   guideBox.y,
      guideW:   guideBox.w,
      guideH:   guideBox.h,
    }).catch((e: any) => console.warn('[SET_GUIDE_BOX] 실패:', e))
  }, [nativePreviewSize, guideBox])

  // [한글 주석] LT-AUTOCAP-002: SizeSelectScreen 폐기로 뒤로가기 목적지 변경
  // (sizeSelect -> certSelect, 빅보스 확정 2026-07-22)
  const handleBack = useCallback(() => {
    navigateToScreen('certSelect')
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
    { num: '01', title: '카드를 가이드박스에 맞춰주세요', desc: '기울어지지 않게 수평으로 놓아주세요' },
    { num: '02', title: '카드를 가이드박스에 꽉 채워주세요', desc: '카드 네 모서리를 가이드 선에 최대한 가깝게 맞춰주세요' },
    { num: '03', title: '카드 테두리와 대비되는 배경에서 촬영해주세요', desc: '테두리가 밝으면 어두운 배경에, 테두리가 어두우면 밝은 배경에 놓아주세요' },
    { num: '04', title: '빛 반사를 피해 촬영해주세요', desc: '카드 표면에 조명이 직접 반사되지 않게 해주세요' },
    { num: '05', title: '촬영할 때 휴대폰을 움직이지 마세요', desc: '촬영 버튼을 누른 후 잠시 그대로 유지해주세요' },
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

        {/* 가이드박스 오버레이 (LT-GUIDEBOX-VISUAL-MISMATCH-001: guideBox SSOT 통합, visualGuideBox/visualMinBox 제거) */}
        {guideBox.w > 0 && (
          <div style={{ position: 'absolute', left: `${guideBox.x}px`, top: `${guideBox.y}px`, width: `${guideBox.w}px`, height: `${guideBox.h}px`, pointerEvents: 'none', zIndex: 10 }}>
            <div style={{ ...cornerStyle({ top: 0, left: 0 }), borderTop: `2px solid ${guideColor}`, borderLeft: `2px solid ${guideColor}`, borderTopLeftRadius: '8px' }} />
            <div style={{ ...cornerStyle({ top: 0, right: 0 }), borderTop: `2px solid ${guideColor}`, borderRight: `2px solid ${guideColor}`, borderTopRightRadius: '8px' }} />
            <div style={{ ...cornerStyle({ bottom: 0, left: 0 }), borderBottom: `2px solid ${guideColor}`, borderLeft: `2px solid ${guideColor}`, borderBottomLeftRadius: '8px' }} />
            <div style={{ ...cornerStyle({ bottom: 0, right: 0 }), borderBottom: `2px solid ${guideColor}`, borderRight: `2px solid ${guideColor}`, borderBottomRightRadius: '8px' }} />
            <div style={{ position: 'absolute', left: `${guideBox.w / 2 - 3}px`, top: `${guideBox.h / 2 - 3}px`, width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
          </div>
        )}
      </div>

      {/* 하단 촬영 버튼 */}
      <div style={{ padding: '24px', paddingBottom: 'max(40px, env(safe-area-inset-bottom))', background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', marginBottom: '8px', textAlign: 'center', letterSpacing: '0.05em' }}>
          {capturing ? '처리 중...' : (
            <>
              카드 전체가 네 모서리 안에 보이게 맞춰주세요<br />
              카드가 중앙 표시를 충분히 덮도록 가까이 촬영하세요
            </>
          )}
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
