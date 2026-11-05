// CameraScreen.tsx v4.12
// GEOCAM-REFACTOR-V1 STEP2 (2026-08-13): 카드규격 토글 + 가이드박스 확대 + 노란색
// - GUIDE_H_RATIO 0.55 -> 0.70 (카드 충족률 부족으로 인한 검출실패 문제 해결,
//   오늘 세션 실측: 충족률 61~67%=FAIL, 68~77%=PASS 근거로 조정)
// - CARD_ASPECT_H_OVER_W 하드코딩 삭제 -> CARD_TYPES 2종(종이/PVC) 토글로 대체
//   (SizeSelectScreen 재도입 아님 - CameraScreen 내부 UI 토글만, 촬영 가이드
//    비율 표시용으로만 사용. 서버 전송/좌표계산/GeoCode Search 전부 무변경)
// - 가이드박스 색상 흰색 -> 노란색 (가시성 개선)
// 이전(v4.11): SC-4 Preview 좌표계 버그 수정 (2026-08-04)
// 원인: previewW/H로 cameraViewSize(하단 촬영버튼 영역만큼 잘린 flex 자식 div,
//      360x595)를 사용했으나, 서버 calculateFillCenterCrop()과 네이티브
//      Java computeGuideRectInFrame()은 이 값을 "실제 PreviewView 전체 크기"로
//      취급함. 실제 PreviewView는 MATCH_PARENT(MainActivity.java)라 화면 전체를
//      차지하므로 진짜 크기는 1080x2340px(DPR=3 환산 360x780dp) — 185dp 차이가
//      FILL_CENTER offsetY 오계산 -> crop top 약 483px 오차로 이어짐.
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
const GUIDE_H_RATIO         = 0.70
const GUIDE_W_MAX_RATIO     = 0.88
const GUIDE_SAFE_AREA_RATIO = 0.94
// GEO-CAM-ARCHITECTURE-001 STEP 3-2: UI표시(6도)와 AutoCapture판정(3도) 기준 분리, 절대 통합 금지
const UI_TILT_MAX_DEG = 8 // LT-GEOCAM-FINALIZE-002 제니팀장 LOCK: 6도도 실사용 HOLD 부족 확인 -> 8도로 재상향
const AUTO_CAPTURE_TILT_MAX_DEG = 8 // LT-GEOCAM-FINALIZE-002 제니팀장 LOCK: UI/AutoCapture 동일값 유지, 8도로 재상향
// GEOCAM-REFACTOR-V1 STEP2 버그수정: 헤더+카드타입 토글이 차지하는 상단영역.
// 가이드박스가 이 영역과 겹치지 않도록 제외하고 중앙정렬. 잠정치 - 실기기 미세조정 가능.
const TOP_RESERVED           = 140
const DEBUG_CROP_LOG        = true
const NEO_API_BASE          = 'https://neo-api.artionchain.com/api'
void API_BASE_URL

// [한글 주석] GEOCAM-REFACTOR-V1 STEP2 (2026-08-13): 카드규격 2종 지원.
// 촬영 가이드 UI 표시(비율 계산)용으로만 사용 — 서버 전송/좌표계산/GeoCode
// Search와는 전혀 무관. SizeSelectScreen 재도입 아님(2026-07-22 폐기 유지),
// CameraScreen 내부 토글만 추가.
// 종이(K-POP 포토카드): 55 x 85mm / PVC(CR80, ISO/IEC 7810 ID-1): 53.98 x 85.60mm
const CARD_TYPES = {
  PAPER_KPOP: { label: '종이', w: 55, h: 85 },
  PVC_CR80:   { label: 'PVC', w: 53.98, h: 85.60 },
} as const

type CardTypeKey = keyof typeof CARD_TYPES

// ── CameraScreen v4.12 ──────────────────────────────────────────────────────

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
  // GEOCAM-REFACTOR-INTEGRATED-001: 수평계 (촬영 품질 안내 전용, 판정 사용 금지)
  const [tiltDeg, setTiltDeg] = useState<number | null>(null)
  // SC-4 수정: 네이티브 PreviewView 실제 크기 (startPreview() 응답의 viewPortW/H를
  // devicePixelRatio로 환산, 780 등 하드코딩 없음 — 항상 기기 실측값)
  const [nativePreviewSize, setNativePreviewSize] = useState({ w: 0, h: 0 })
  // GEOCAM-REFACTOR-V1 STEP2: 카드규격 토글, 기본값 PVC(기존 실측/앱 기준과 동일해서 회귀위험 최소화)
  const [selectedCardType, setSelectedCardType] = useState<CardTypeKey>('PVC_CR80')

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

  // GEOCAM-REFACTOR-V1 STEP2: 선택된 카드타입의 세로/가로 비율 (가이드박스 계산용)
  const cardAspectHOverW = useMemo(() => {
    const t = CARD_TYPES[selectedCardType]
    return t.h / t.w
  }, [selectedCardType])

  // ── guideBox 계산 (STEP2: 카드타입 토글 반영, 카드종류 선택화면 없음) ──────
  // LT-GUIDEBOX-VISUAL-MISMATCH-001: 화면표시/서버전송/자동촬영판단 3곳 모두
  // 이 guideBox 하나만 참조하는 SSOT (Single Source of Truth) — 계산식 구조 무수정
  // (SC-4 수정 범위 밖: cameraViewSize 기준 그대로 유지, 시뮬레이션에서 오차제거 확인됨)
  const guideBox = useMemo(() => {
    const { w: vw, h: vh } = cameraViewSize
    if (!vw || !vh) return { x: 0, y: 0, w: 0, h: 0 }
    const availableH = Math.max(0, vh - TOP_RESERVED)
    const maxGuideH = availableH * GUIDE_H_RATIO
    const maxGuideW = vw * GUIDE_W_MAX_RATIO
    let guideH = maxGuideH
    let guideW = guideH / cardAspectHOverW
    if (guideW > maxGuideW) {
      guideW = maxGuideW
      guideH = guideW * cardAspectHOverW
    }
    return {
      x: Math.round((vw - guideW) / 2),
      y: Math.round(TOP_RESERVED + (availableH - guideH) / 2),
      w: Math.round(guideW),
      h: Math.round(guideH),
    }
  }, [cameraViewSize, cardAspectHOverW])

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

  // ── 수평계 (devicemotion 중력가속도 기반, 촬영 품질 안내 전용) ─────────────────
  // GEOCAM-REFACTOR-INTEGRATED-001: DeviceOrientationEvent(beta/gamma)는 평평한
  // 자세 근처에서 짐벌락(Gimbal Lock)으로 축별 민감도가 달라지는 알려진 한계가 있음
  // (W3C 스펙/MDN 확인됨). 대신 devicemotion의 중력가속도 벡터를 직접 써서
  // 오일러각 계산을 거치지 않는 방식으로 전환 — 방향 상관없이 균일하게 반응.
  // 중요: 이 값은 GeoCode 판정이나 서버 PASS/FAIL에 절대 사용하지 않음.
  useEffect(() => {
    const handleMotion = (event: DeviceMotionEvent) => {
      const g = event.accelerationIncludingGravity
      if (!g || g.x === null || g.y === null || g.z === null) return
      // 폰이 카드를 위에서 내려다보며 평평히 놓인 자세 기준: 중력은 z축(-9.8 근처)에
      // 몰려있어야 함. x, y 성분이 커질수록 기울어진 것 — 벡터 크기로 기울기 표현.
      const tiltMagnitude = Math.sqrt(g.x * g.x + g.y * g.y)
      // 라디안 -> 도(degree) 변환 (전체 중력벡터 대비 x,y 성분의 각도)
      const totalG = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z) || 9.8
      const tiltAngle = (Math.asin(Math.min(1, tiltMagnitude / totalG)) * 180) / Math.PI
      setTiltDeg(Math.round(tiltAngle * 10) / 10)
      // NS-LEGITTAG-AUTOCAPTURE-STEP-A2 STEP3(수정판): native 4번째 촬영품질 게이트로 전달.
      // 카드 위치 판단 아님 - 순수 기기 자세(tilt) 품질값만 전달. 실패해도 촬영 흐름 막지 않음.
      ;(YuvCamera as any).setTiltStatus({ tiltOk: Math.abs(tiltAngle) <= AUTO_CAPTURE_TILT_MAX_DEG, tiltDeg: tiltAngle }).catch(() => {})
    }
    window.addEventListener("devicemotion", handleMotion)
    return () => window.removeEventListener("devicemotion", handleMotion)
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
  const capturePhoto = useCallback(async () => {
    const triggerTime = Date.now()
    console.log(`[CAPTURE] ENTER source=auto t=${triggerTime}`)

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
      const verifyStartedAt = Date.now()
      const verifyTimeoutMs = 60000
      const verifyAbortController = new AbortController()
      function awaitVerify<T>(promise: Promise<T>): Promise<T> {
        const remainingMs = verifyTimeoutMs - (Date.now() - verifyStartedAt)
        if (remainingMs <= 0) {
          verifyAbortController.abort()
          return Promise.reject(new Error(`VERIFY_TIMEOUT_${verifyTimeoutMs}MS`))
        }

        return new Promise<T>((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
            verifyAbortController.abort()
            reject(new Error(`VERIFY_TIMEOUT_${verifyTimeoutMs}MS`))
          }, remainingMs)

          promise.then(
            value => { window.clearTimeout(timeoutId); resolve(value) },
            error => { window.clearTimeout(timeoutId); reject(error) },
          )
        })
      }
      console.log(`[STEP3] verify timeout: ${verifyTimeoutMs}ms`)
      const fileData = await awaitVerify(Filesystem.readFile({ path: photoResult.path }))
      const base64Str = typeof fileData.data === 'string' ? fileData.data : ''
      const binaryStr = atob(base64Str)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

      const hashBuf = await awaitVerify(crypto.subtle.digest('SHA-256', bytes))
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
        formData.append('tilt_deg',           tiltDeg !== null ? String(tiltDeg) : '') // NS-LEGITTAG-AUTOCAPTURE-STEP-A2: 진단용 metadata, 좌표보정 아님
      formData.append('preview_scale_type', 'FILL_CENTER')
      // LT-DINA-CONTEXT-001 수정: 등록된 dina_id 있을 때만 물리검증 요청에 포함
      // dina_id는 서버(geocode-block.ts)에서 optional 필드 — 없으면 UNREGISTERED로 정상처리(홈->Camera 단독촬영 경로 그대로 보존)
      if (dinaId) {
        formData.append('dina_id', dinaId)
      }
      console.log('[STEP4A] 메타데이터 전달:', JSON.stringify({
        preview: { w: nativePreviewSize.w, h: nativePreviewSize.h },
        guide:   { x: guideBox.x, y: guideBox.y, w: guideBox.w, h: guideBox.h },
        image:   { w: photoResult.width, h: photoResult.height },
        exifRotation: photoResult.exifRotation ?? 0,
        scaleType: 'FILL_CENTER',
      }))

      console.log('[STEP3] multipart 전송 시작')
      const uploadRes = await awaitVerify(fetch(`${NEO_API_BASE}/geocode-block/detect`, {
        method: 'POST',
        body: formData,
        signal: verifyAbortController.signal,
      }))

      if (!uploadRes.ok) {
        const errBody = await awaitVerify(uploadRes.json()).catch(() => ({}))
        throw new Error(`verify-file error: ${uploadRes.status} ${JSON.stringify(errBody)}`)
      }

      const uploadResult = await awaitVerify(uploadRes.json())
      console.log('[STEP3] 서버 응답    :', JSON.stringify(uploadResult))
      console.log('[STEP3] transferIntegrity:', uploadResult.transferIntegrity)
      console.log('[STEP3] clientSha256 :', uploadResult.clientSha256)
      console.log('[STEP3] serverSha256 :', uploadResult.serverSha256)
      console.log('[STEP3] serverSize   :', uploadResult.serverFileSize)
      console.log('[STEP3] verdict      :', uploadResult.verdict)

      // GEO-AUTH-001 verdict매핑버그수정(2026-08-16): 서버(GeoDetectCircleV7Service)는
      // 'GEO_PASS'|'GEO_FAIL'|'GEO_UNCERTAIN'만 반환함 - 기존 'SIGNAL_PRESENT'/'SIGNAL_UNCERTAIN'
      // 비교는 서버가 절대 내려주지 않는 값이라 항상 else(ABSENT)로 빠지던 버그
      if (uploadResult.transferIntegrity === false) {
        setVerifyStatus('INSUFFICIENT_DATA')
      } else if (uploadResult.verdict === 'GEO_PASS') {
        setVerifyStatus('PRESENT')
      } else if (uploadResult.verdict === 'GEO_UNCERTAIN') {
        setVerifyStatus('INSUFFICIENT_DATA')
      } else if (uploadResult.verdict === 'GEO_FAIL') {
        setVerifyStatus('ABSENT')
      } else {
        // 알 수 없는 verdict(UNKNOWN) - 재촬영 유도(INSUFFICIENT_DATA)로 처리
        setVerifyStatus('INSUFFICIENT_DATA')
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

  // ── GCS-AUTO-CAPTURE-001 재연결: 네이티브 autoCaptureReady -> capturePhoto(auto) ──
  // 4중게이트(밝기/포커스/모션/기울기) 전부 통과 시 네이티브가 이 이벤트를 쏜다.
  // capturePhoto는 기존에 이미 auto 모드를 지원하므로 그대로 재사용(무수정).
  useEffect(() => {
    let listenerHandle: any = null
    ;(YuvCamera as any).addListener('autoCaptureReady', () => {
      console.log('[AUTO-CAPTURE] JS 리스너 수신 -> capturePhoto(auto) 호출')
      capturePhoto()
    }).then((handle: any) => { listenerHandle = handle })
    return () => { listenerHandle?.remove?.() }
  }, [capturePhoto])

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
    }).then(() => {
      // GEOCAM-REFACTOR-INTEGRATED-001: 가이드박스 중앙에 AF/AE 트리거
      const focusX = guideBox.x + guideBox.w / 2
      const focusY = guideBox.y + guideBox.h / 2
      ;(YuvCamera as any).triggerAutoFocus({ x: focusX, y: focusY })
        .catch((e: any) => console.warn('[AF_AE] triggerAutoFocus 실패:', e))
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

  // GEOCAM-REFACTOR-V1 STEP2: 노란색으로 변경 (가시성 개선)
  const guideColor = 'rgba(250,204,21,0.85)'
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

      {/* 카드규격 토글 (GEOCAM-REFACTOR-V1 STEP2) - 촬영 가이드 UI 전용, 서버 전송값 아님 */}
      <div style={{ position: 'absolute', top: 'calc(max(48px, env(safe-area-inset-top)) + 56px)', left: 0, right: 0, zIndex: 20, display: 'flex', justifyContent: 'center', gap: '8px' }}>
        {(Object.keys(CARD_TYPES) as CardTypeKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setSelectedCardType(key)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 400,
              cursor: 'pointer',
              background: selectedCardType === key ? 'rgba(250,204,21,0.18)' : 'rgba(0,0,0,0.45)',
              border: selectedCardType === key ? '1px solid rgba(250,204,21,0.6)' : '1px solid rgba(255,255,255,0.1)',
              color: selectedCardType === key ? '#facc15' : 'rgba(255,255,255,0.6)',
            }}
          >
            {CARD_TYPES[key].label} {CARD_TYPES[key].w}×{CARD_TYPES[key].h}
          </button>
        ))}
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
            {/* 수평계 인디케이터 (촬영 품질 안내 전용, 판정 무관) — 가이드박스 중앙 배치 */}
            {tiltDeg !== null && (
              <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: 16, padding: "6px 14px", borderRadius: "20px", background: "rgba(0,0,0,0.55)", border: `1px solid ${Math.abs(tiltDeg) <= UI_TILT_MAX_DEG ? "rgba(74,222,128,0.6)" : "rgba(250,204,21,0.6)"}`, display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: Math.abs(tiltDeg) <= UI_TILT_MAX_DEG ? "#4ade80" : "#facc15" }} />
                <span style={{ color: Math.abs(tiltDeg) <= UI_TILT_MAX_DEG ? "#4ade80" : "#facc15", fontSize: "12px", fontWeight: 400, whiteSpace: "nowrap" }}>
                  {Math.abs(tiltDeg) <= UI_TILT_MAX_DEG ? "수평 양호" : "기울어짐"} ({tiltDeg}°)
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 하단 자동촬영 안내 */}
      <div style={{ padding: '24px', paddingBottom: 'max(40px, env(safe-area-inset-bottom))', background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', lineHeight: '1.4', minHeight: '31px', marginBottom: '8px', textAlign: 'center', letterSpacing: '0.05em' }}>
          {capturing ? '처리 중...' : (
            <>
              카드 전체가 네 모서리 안에 보이게 맞춰주세요<br />
              카드가 중앙 표시를 충분히 덮도록 가까이 촬영하세요
            </>
          )}
        </p>
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

