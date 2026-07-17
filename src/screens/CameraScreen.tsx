// CameraScreen.tsx v4.3
// LC-CAM-001 v4.0 LOCK 기준
// 작성: 짱아 / 2026-06-30
//
// v4.0: AUTO_CAPTURE_ENABLED=false 복원, HybridVerifyResult 타입, resetCaptureLock()
// v4.1 (2026-06-30): NeoStudio /physical/verify 경유로 전환
//   - 클라이언트가 GeoStudio detect-hybrid-v3를 직접 호출하지 않음 (Phase 1.5 보안 계약)
//   - geocode_token(dina_id)만 전송, 서버가 내부 매핑 + 검출 + claim + ownership 처리
//   - startPhysicalSession() 재활성화
//   - verifyEventId 응답 수신 (LC-005 MyCollection 저장에서 사용 예정)
// v4.2 (2026-07-04): LC-PHOTO-002 해결
//   - dinaId 없을 때 /physical/detect-signal 호출 (순수 신호 검출)
//   - dinaId 있을 때 기존 /physical/verify 유지
//   - 보안: API 키는 서버간 통신만 사용 (레그캠 노출 없음)
// v4.3 (2026-07-17): GEO-CAM-TRANSFER-001 STEP 2
//   - capturePhoto() 내 canvas 캡처 경로 주석 처리
//   - YuvCamera.capturePhotoFile() 호출 → path/uri/fileSize/mimeType 콘솔 출력
//   - 서버 업로드 / multipart / SHA-256 / API 호출 수정 없음
//
// 금지(v4.0 §33):
//   - 엣지 기반 탐지 재도입
//   - crop margin 적용
//   - 가이드박스 좌표 서버 전송
//   - window.innerHeight 가이드박스 계산
//   - ENGINE 400x600 좌표계 변경
//   - callDetectLayer2 삭제 (디버그/회귀 테스트용 유지)
//   - detect-hybrid-v3 없이 PASS_CONFIRMED 생성
//   - pass_count 단일 기준 판정
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { API_BASE_URL } from '../api/client'
import { Filesystem, Directory } from '@capacitor/filesystem'
import type { CameraScreenProps } from '../types/app.types'
import { registerPlugin } from '@capacitor/core'
const YuvCamera = registerPlugin('YuvCamera')
// ─── 상수 (LC-CAM-001 v4.0 LOCK §10) ─────────────────────────────────────────
// 가이드박스
const GUIDE_H_RATIO         = 0.55
const GUIDE_W_MAX_RATIO     = 0.88
// safe area 안내 (§10 주의: margin 추가용 아님, UI 안내용만)
const GUIDE_SAFE_AREA_RATIO = 0.94
// 품질 체크
const LIGHT_CHECK_INTERVAL_MS = 250
const BRIGHTNESS_MIN          = 60
const BRIGHTNESS_MAX          = 210
const BLUR_MIN                = 25
const GLARE_PIXEL_THRESHOLD   = 245
const GLARE_MAX_RATIO         = 0.07
// 안정 프레임
const STABLE_REQUIRED         = 4
// 카드 존재 인식(직사각형 윤곽 검출) threshold
const CARD_ASPECT_RATIO       = 55 / 85
const CARD_ASPECT_TOLERANCE   = 0.15
const CARD_BOUNDARY_THRESHOLD = 0.45           // 개발용 임시값
const MIN_EDGE_GATE            = 0.05           // edge hard gate
// 자동 캡처 (v4.0 이후 true — 카드 감지 시 자동 촬영)
const AUTO_CAPTURE_ENABLED    = true
const AUTO_CAPTURE_DELAY_MS   = 300
// 디버그 (운영 빌드 시 false)
const DEBUG_CROP_LOG          = true
// API
const GEO_API_BASE  = 'https://geo-api.artionchain.com/api'
const NEO_API_BASE  = 'https://neo-api.artionchain.com/api'
void GEO_API_BASE
void AUTO_CAPTURE_DELAY_MS
type QualityState =
  | 'IDLE'
  | 'READY'
  | 'WARNING_BRIGHTNESS_LOW'
  | 'WARNING_BRIGHTNESS_HIGH'
  | 'WARNING_BLUR'
  | 'WARNING_GLARE'
  | 'WARNING_TOO_CLOSE'
  | 'WARNING_TOO_FAR'
  | 'WARNING_CROPPED'
// ─── physical/verify 응답 타입 (v4.0 LOCK §19 + Phase 1.5 보안 계약) ─────────
interface PhysicalVerifyApiResult {
  success: boolean
  verdict: 'PHYSICAL VERIFIED' | 'RETRY' | 'INVALID'
  hybrid_verdict?: 'PASS' | 'UNCERTAIN' | 'FAIL'
  reason_code?: string
  dina_id?: string
  asset_public_id?: string
  series_id?: string
  verifyEventId?: string | null
  canSaveToMyCollection?: boolean
  canCreateListing?: boolean
  message?: string
  error?: string
}
type PhysicalVerifyVerdict = 'PHYSICAL VERIFIED' | 'RETRY' | 'INVALID'
// ─── detect-signal 응답 타입 (v4.2 LC-PHOTO-002) ────────────────────────────
interface DetectSignalApiResult {
  success: boolean
  verdict: 'SIGNAL_PRESENT' | 'SIGNAL_UNCERTAIN' | 'SIGNAL_ABSENT' | 'SIGNAL_UNKNOWN'
  overall_excess: number
  positive_rate: number
  processing_ms: number
  detected_at: string
  error?: string
}
// ─── 유틸 함수 ────────────────────────────────────────────────────────────────
function calcBrightness(imageData: ImageData): number {
  const { data, width, height } = imageData
  let sum = 0
  const total = width * height
  for (let i = 0; i < total; i++) {
    sum += 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  }
  return sum / total
}
function calcLaplacianVariance(imageData: ImageData): number {
  const { data, width, height } = imageData
  const gray = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  }
  const lap = new Float32Array(width * height)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      lap[y * width + x] =
        gray[(y - 1) * width + x] + gray[(y + 1) * width + x] +
        gray[y * width + (x - 1)] + gray[y * width + (x + 1)] -
        4 * gray[y * width + x]
    }
  }
  const n = (width - 2) * (height - 2)
  const mean = lap.reduce((a, b) => a + b, 0) / n
  const variance = lap.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n
  return variance
}
function calcGlareRatio(imageData: ImageData): number {
  const { data } = imageData
  let glareCount = 0
  const total = data.length / 4
  for (let i = 0; i < total; i++) {
    if (
      data[i * 4]     >= GLARE_PIXEL_THRESHOLD &&
      data[i * 4 + 1] >= GLARE_PIXEL_THRESHOLD &&
      data[i * 4 + 2] >= GLARE_PIXEL_THRESHOLD
    ) {
      glareCount++
    }
  }
  return glareCount / total
}

// ─── 직사각형 윤곽 검출 (카드 존재 인식) ────────────────────────────────────
// ── Card Boundary Engine (LC-CARD-BOUNDARY-001 v1.0) ─────────────────────
// GEO-CAM-001 PHASE 4 / 2026-07-07
interface CardBoundaryResult {
  cardDetected:       boolean
  boundaryConfidence: number
  edgeScore:          number
  aspectRatioScore:   number
  coverageScore:      number
  aspectRatio:        number
  ok:                 boolean
  avgScore:           number
  topScore:           number
  bottomScore:        number
  leftScore:          number
  rightScore:         number
}

function detectCardBoundary(imageData: ImageData): CardBoundaryResult {
  const { data, width, height } = imageData
  if (width < 10 || height < 10) {
    return { cardDetected: false, boundaryConfidence: 0, edgeScore: 0, aspectRatioScore: 0, coverageScore: 0, aspectRatio: 0, ok: false, avgScore: 0, topScore: 0, bottomScore: 0, leftScore: 0, rightScore: 0 }
  }
  const getGray = (x: number, y: number): number => {
    const i = (y * width + x) * 4
    return (data[i] * 299 + data[i+1] * 587 + data[i+2] * 114) / 1000
  }
  const bandH = Math.max(4, Math.floor(height * 0.08))
  const bandW = Math.max(4, Math.floor(width  * 0.08))
  const measureHEdge = (yStart: number, yEnd: number): number => {
    let score = 0; let count = 0
    for (let y = yStart; y < yEnd - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (Math.abs(getGray(x, y+1) - getGray(x, y)) > 15) score++
        count++
      }
    }
    return count > 0 ? score / count : 0
  }
  const measureVEdge = (xStart: number, xEnd: number): number => {
    let score = 0; let count = 0
    for (let y = 1; y < height - 1; y++) {
      for (let x = xStart; x < xEnd - 1; x++) {
        if (Math.abs(getGray(x+1, y) - getGray(x, y)) > 15) score++
        count++
      }
    }
    return count > 0 ? score / count : 0
  }
  const topScore    = measureHEdge(0, bandH)
  const bottomScore = measureHEdge(height - bandH, height)
  const leftScore   = measureVEdge(0, bandW)
  const rightScore  = measureVEdge(width - bandW, width)
  const edgeScore   = (topScore + bottomScore + leftScore + rightScore) / 4
  const passCount   = [topScore, bottomScore, leftScore, rightScore].filter(s => s >= 0.08).length
  const measuredRatio    = width / height
  const aspectRatioScore = Math.max(0, 1 - Math.abs(measuredRatio - CARD_ASPECT_RATIO) / CARD_ASPECT_TOLERANCE)
  const cx0 = Math.floor(width * 0.2); const cy0 = Math.floor(height * 0.2)
  const cx1 = Math.floor(width * 0.8); const cy1 = Math.floor(height * 0.8)
  const centerVals: number[] = []
  for (let y = cy0; y < cy1; y += 4) for (let x = cx0; x < cx1; x += 4) centerVals.push(getGray(x, y))
  const centerMean = centerVals.reduce((a, b) => a + b, 0) / centerVals.length
  const centerStd  = Math.sqrt(centerVals.reduce((a, b) => a + (b - centerMean) ** 2, 0) / centerVals.length)
  const coverageScore    = centerMean > 30 && centerStd < 60 ? Math.max(0, 1 - centerStd / 60) : 0
  const boundaryConfidence = edgeScore * 0.30 + aspectRatioScore * 0.45 + coverageScore * 0.25
  const cardDetected = passCount >= 2 && edgeScore >= MIN_EDGE_GATE && aspectRatioScore >= 0.60 && boundaryConfidence >= CARD_BOUNDARY_THRESHOLD
  return {
    cardDetected, boundaryConfidence: Math.round(boundaryConfidence*1000)/1000,
    edgeScore: Math.round(edgeScore*1000)/1000, aspectRatioScore: Math.round(aspectRatioScore*1000)/1000,
    coverageScore: Math.round(coverageScore*1000)/1000, aspectRatio: Math.round(measuredRatio*1000)/1000,
    ok: cardDetected, avgScore: Math.round(edgeScore*1000)/1000,
    topScore: Math.round(topScore*1000)/1000, bottomScore: Math.round(bottomScore*1000)/1000,
    leftScore: Math.round(leftScore*1000)/1000, rightScore: Math.round(rightScore*1000)/1000,
  }
}

async function canvasToPngBase64(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(blob!)
    }, 'image/png')
  })
}
async function sha256Base64(dataUrl: string): Promise<string> {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const hashBuf = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
// ─── callDetectSignal (LC-PHOTO-002 해결 — dinaId 없을 때 순수 신호 검출) ──────
// 정품인증하기 → 카메라 경로: NeoStudio /physical/detect-signal 호출
// 보안: API 키는 서버간 통신만 사용 (레그캠 노출 없음)
async function callDetectSignal(roiDataUrl: string): Promise<DetectSignalApiResult> {
  const regionImage = roiDataUrl.replace(/^data:image\/\w+;base64,/, '')
  const res = await fetch(`${NEO_API_BASE}/geocam/physical/detect-signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_data: regionImage }),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(`detect-signal error: ${res.status} ${errBody?.error || ''}`)
  }
  return res.json()
}
// ─── callPhysicalVerify (Phase 1.5 보안 계약 + v4.0 LOCK) ────────────────────
// NeoStudio /api/geocam/physical/verify 호출
// 클라이언트는 DINA ID를 detect-hybrid-v3에 직접 보내지 않음
// geocode_token(=dina_id)만 NeoStudio에 전송, 서버가 내부 매핑 + 검출 + claim + ownership 처리
async function callPhysicalVerify(params: {
  scanSessionId: string
  nonce: string
  geocodeToken: string
  roiDataUrl: string
  cardProfileId: string
  authToken: string | null
}): Promise<PhysicalVerifyApiResult> {
  const { scanSessionId, nonce, geocodeToken, roiDataUrl, cardProfileId, authToken } = params
  const roiHash = await sha256Base64(roiDataUrl)
  const regionImage = roiDataUrl.replace(/^data:image\/\w+;base64,/, '')
  const res = await fetch(`${NEO_API_BASE}/geocam/physical/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': 'Bearer ' + authToken } : {}) },
    body: JSON.stringify({
      scan_session_id:      scanSessionId,
      nonce,
      timestamp:             new Date().toISOString(),
      geocode_token:         geocodeToken,
      geocode_region_hash:   roiHash,
      geocode_region_image:  regionImage,
      cardProfileId,
    }),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(`physical/verify error: ${res.status} ${errBody?.error || ''}`)
  }
  return res.json()
}
// ─── CameraScreen v4.3 ────────────────────────────────────────────────────────
const CameraScreen = ({
  safeGoHome, runPipeline, BackArrow, sessionToken, nonce, dinaId, qrData, authToken,
  setCapturedImage, setConfidence, setMatchScore, setVerifyStatus, setRecordInfo,
  setErrorCode, setNetworkError, setProcessing, navigateToScreen, cameraError, setCameraError, selectedCardProfile,
}: CameraScreenProps) => {
  const { t } = useTranslation()
  // ─── refs ──────────────────────────────────────────────────────────────────
  const videoRef               = useRef<HTMLVideoElement>(null)
  const canvasRef              = useRef<HTMLCanvasElement>(null)
  const qualityCanvasRef       = useRef<HTMLCanvasElement>(null)
  const streamRef              = useRef<MediaStream | null>(null)
  const captureLockedRef       = useRef(false)
  const qualityCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stableCountRef         = useRef(0)
  const rectHistoryRef         = useRef<boolean[]>([])
  const capturePhotoRef        = useRef<((source?: 'auto' | 'manual') => Promise<void>) | null>(null)
  const physSessionRef = useRef<{ scan_session_id: string; nonce: string; expires_at: string } | null>(null)
  const cameraViewRef          = useRef<HTMLDivElement>(null)
  // ─── state ─────────────────────────────────────────────────────────────────
  const [cameraReady, setCameraReady]           = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [capturing, setCapturing]               = useState(false)
  const [qualityState, setQualityState]         = useState<QualityState>('IDLE')
  const [showGuideOverlay, setShowGuideOverlay] = useState(true)
  const [cameraViewSize, setCameraViewSize]     = useState({ w: 0, h: 0 })
  // v4.2: dinaId 없을 때 SIGNAL_ONLY 모드
  const isSignalOnlyMode = !dinaId && !qrData
  const geocodeToken = dinaId || qrData || 'TEST-DINA-LAYER2-001'
  void sessionToken; void nonce; void runPipeline; void API_BASE_URL
  void setConfidence; void setMatchScore; void setRecordInfo; void setErrorCode
  // ─── resetCaptureLock (v4.0 LOCK §13) ───────────────────────────────────────
  const resetCaptureLock = useCallback((reason: string) => {
    captureLockedRef.current = false
    rectHistoryRef.current = []
    if (DEBUG_CROP_LOG) console.log('[captureLock] reset:', reason)
  }, [])
  // ─── captureLockedRef 초기화 (mount/focus 진입) ────────────────────────────
  useEffect(() => {
    resetCaptureLock('mount')
    return () => {
      captureLockedRef.current = true
    }
  }, [resetCaptureLock])
  // ─── cameraView 크기 측정 (§11: 실제 카메라 영역 기준) ─────────────────────
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
  // ─── 고정 가이드박스 계산 (v4.0 LOCK §11) ──────────────────────────────────
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
  // ─── safe area 박스 (v4.0 LOCK §12: UI 안내용만, crop 기준 아님) ───────────
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
  // ─── qualityState UI 매핑 (v4.0 LOCK §15) ──────────────────────────────────
  const getBannerText = () => {
    switch (qualityState) {
      case 'READY':                  return '잠시 고정하세요...'
      case 'WARNING_BRIGHTNESS_LOW': return '조명을 밝게 해주세요'
      case 'WARNING_BRIGHTNESS_HIGH':return '기기를 살짝 기울여 반사광을 피해주세요'
      case 'WARNING_BLUR':           return '카드를 고정해주세요'
      case 'WARNING_GLARE':          return '기기를 살짝 기울여 반사광을 피해주세요'
      case 'WARNING_TOO_CLOSE':      return '조금 멀리서 촬영하세요 (20~25cm)'
      case 'WARNING_TOO_FAR':        return '카드를 가이드 박스에 가까이 해주세요'
      case 'WARNING_CROPPED':        return '카드를 박스 안에 정확히 맞춰주세요'
      default:                       return '카드를 박스 안에 맞추고 촬영하세요'
    }
  }
  const getGuideColor = () => {
    if (qualityState === 'READY')              return 'rgba(74,222,128,0.9)'
    if (qualityState.startsWith('WARNING'))    return 'rgba(250,204,21,0.8)'
    return 'rgba(255,255,255,0.6)'
  }
  const getBannerStyle = () => {
    if (qualityState === 'READY')           return { bg: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.35)', color: '#4ade80' }
    if (qualityState.startsWith('WARNING')) return { bg: 'rgba(250,204,21,0.10)', border: '1px solid rgba(250,204,21,0.35)', color: '#facc15' }
    return { bg: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }
  }
  // ─── cropGuideBox (v4.0 LOCK §16) — 품질체크 루프 전용, capturePhoto에서 미사용 ──
  const cropGuideBox = useCallback(async (): Promise<string> => {
    const video = videoRef.current
    if (!video) throw new Error('cropGuideBox: video not ready')
    const videoW   = video.videoWidth
    const videoH   = video.videoHeight
    const previewW = cameraViewSize.w
    const previewH = cameraViewSize.h
    if (!videoW || !videoH || !previewW || !previewH) {
      throw new Error(`cropGuideBox: invalid dimensions video=${videoW}x${videoH} preview=${previewW}x${previewH}`)
    }
    const scale      = Math.max(previewW / videoW, previewH / videoH)
    const displayedW = videoW * scale
    const displayedH = videoH * scale
    const offsetX    = (displayedW - previewW) / 2
    const offsetY    = (displayedH - previewH) / 2
    const videoCropX = Math.max(0, (guideBox.x + offsetX) / scale)
    const videoCropY = Math.max(0, (guideBox.y + offsetY) / scale)
    const videoCropW = Math.min(guideBox.w / scale, videoW - videoCropX)
    const videoCropH = Math.min(guideBox.h / scale, videoH - videoCropY)
    const cropW = Math.round(videoCropW)
    const cropH = Math.round(videoCropH)
    if (cropW <= 0 || cropH <= 0) {
      throw new Error(`cropGuideBox: invalid crop size w=${cropW} h=${cropH}`)
    }
    if (DEBUG_CROP_LOG) {
      console.log('[cropGuideBox] profile:', selectedCardProfile.id)
      console.log('[cropGuideBox] cameraView:', previewW, previewH)
      console.log('[cropGuideBox] video:', videoW, videoH)
      console.log('[cropGuideBox] scale:', scale.toFixed(4))
      console.log('[cropGuideBox] offset:', offsetX.toFixed(1), offsetY.toFixed(1))
      console.log('[cropGuideBox] guideBox:', guideBox)
      console.log('[cropGuideBox] videoCrop:', videoCropX.toFixed(1), videoCropY.toFixed(1), videoCropW.toFixed(1), videoCropH.toFixed(1))
      console.log('[cropGuideBox] output:', cropW, cropH)
    }
    const canvas = document.createElement('canvas')
    canvas.width  = cropW
    canvas.height = cropH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('cropGuideBox: canvas context failed')
    ctx.drawImage(
      video,
      Math.round(videoCropX), Math.round(videoCropY),
      cropW, cropH,
      0, 0, cropW, cropH,
    )
    return new Promise<string>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('cropGuideBox: canvas.toBlob failed'))
          return
        }
        const reader = new FileReader()
        reader.onload  = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      }, 'image/png')
    })
  }, [guideBox, cameraViewSize, selectedCardProfile])
  // ─── 품질 체크 루프 (v4.0 LOCK §14) ────────────────────────────────────────
  useEffect(() => {
    if (!cameraReady || capturing) return
    qualityCheckIntervalRef.current = setInterval(() => {
      if (captureLockedRef.current) return
      const video  = videoRef.current
      const canvas = qualityCanvasRef.current
      if (!video || !canvas || !guideBox.w || !guideBox.h) return
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      const sampleW = 160
      const sampleH = Math.round(sampleW * (guideBox.h / guideBox.w))
      canvas.width  = sampleW
      canvas.height = sampleH
      const videoW2   = video.videoWidth
      const videoH2   = video.videoHeight
      const previewW2 = cameraViewSize.w
      const previewH2 = cameraViewSize.h
      if (!videoW2 || !videoH2 || !previewW2 || !previewH2) return
      const qScale      = Math.max(previewW2 / videoW2, previewH2 / videoH2)
      const qDisplayedW = videoW2 * qScale
      const qDisplayedH = videoH2 * qScale
      const qOffsetX     = (qDisplayedW - previewW2) / 2
      const qOffsetY     = (qDisplayedH - previewH2) / 2
      const qVideoCropX = Math.max(0, (guideBox.x + qOffsetX) / qScale)
      const qVideoCropY = Math.max(0, (guideBox.y + qOffsetY) / qScale)
      const qVideoCropW = Math.min(guideBox.w / qScale, videoW2 - qVideoCropX)
      const qVideoCropH = Math.min(guideBox.h / qScale, videoH2 - qVideoCropY)
      console.log(`[GuideBox] visual x=${guideBox.x} y=${guideBox.y} w=${guideBox.w} h=${guideBox.h}`)
      console.log(`[CropROI] videoCrop x=${qVideoCropX.toFixed(1)} y=${qVideoCropY.toFixed(1)} w=${qVideoCropW.toFixed(1)} h=${qVideoCropH.toFixed(1)} (scale=${qScale.toFixed(3)} videoSize=${videoW2}x${videoH2} previewSize=${previewW2}x${previewH2})`)
      if (qVideoCropW <= 0 || qVideoCropH <= 0) return
      ctx.drawImage(
        video,
        qVideoCropX, qVideoCropY, qVideoCropW, qVideoCropH,
        0, 0, sampleW, sampleH,
      )
      const imageData = ctx.getImageData(0, 0, sampleW, sampleH)
      const brightness = calcBrightness(imageData)
      if (brightness < BRIGHTNESS_MIN) {
        stableCountRef.current = 0
        setQualityState('WARNING_BRIGHTNESS_LOW')
        return
      }
      if (brightness > BRIGHTNESS_MAX) {
        stableCountRef.current = 0
        setQualityState('WARNING_BRIGHTNESS_HIGH')
        return
      }
      const blurVariance = calcLaplacianVariance(imageData)
      if (blurVariance < BLUR_MIN) {
        stableCountRef.current = 0
        setQualityState('WARNING_BLUR')
        return
      }
      const glareRatio = calcGlareRatio(imageData)
      if (glareRatio > GLARE_MAX_RATIO) {
        stableCountRef.current = 0
        setQualityState('WARNING_GLARE')
        return
      }
      const rectCheck = detectCardBoundary(imageData)
      console.log("[CardBoundary] detected=" + rectCheck.cardDetected + " confidence=" + rectCheck.boundaryConfidence + " edge=" + rectCheck.edgeScore + " aspect=" + rectCheck.aspectRatioScore + " coverage=" + rectCheck.coverageScore + " ratio=" + rectCheck.aspectRatio)
      // [STEP 2-A TEST] Native edge map 검증 — 2026-07-07
      ;(async () => {
        try {
          const testCanvas = document.createElement('canvas')
          testCanvas.width  = sampleW
          testCanvas.height = sampleH
          const testCtx = testCanvas.getContext('2d')
          if (testCtx) {
            testCtx.putImageData(imageData, 0, 0)
            const yBase64Raw = testCanvas.toDataURL('image/png').replace(/^data:image\/\w+;base64,/, '')
            const nativeResult = await (YuvCamera as any).detectCardBoundary({
              yBase64:         yBase64Raw,
              width:           sampleW,
              height:          sampleH,
              targetWidthMm:   selectedCardProfile.widthMm,
              targetHeightMm:  selectedCardProfile.heightMm,
              aspectTolerance: (selectedCardProfile as any).aspectTolerance ?? 0.15,
            })
            console.log('[Native2A] step=' + nativeResult.step
              + ' edgePixelCount=' + nativeResult.edgePixelCount
              + ' edgeRatio=' + nativeResult.edgeRatio?.toFixed(4)
              + ' highT=' + nativeResult.highThreshold?.toFixed(1)
              + ' lowT='  + nativeResult.lowThreshold?.toFixed(1))
          }
        } catch (e) {
          console.warn('[Native2A] error:', e)
        }
      })()
      rectHistoryRef.current.push(rectCheck.cardDetected)
      if (rectHistoryRef.current.length > 4) rectHistoryRef.current.shift()
      const recentPassCount = rectHistoryRef.current.filter(Boolean).length
      const rectStable = recentPassCount >= 3
      const qualityReady = true
      const rectReady = recentPassCount >= 3
      console.log(`[AutoGate] qualityReady=${qualityReady} rectReady=${rectReady} recentPass=${recentPassCount} rectStable=${rectStable} autoCaptureLocked=${captureLockedRef.current} stableCount=${stableCountRef.current}/${STABLE_REQUIRED}`)
      if (!rectStable) {
        stableCountRef.current = Math.max(0, stableCountRef.current - 1)
        setQualityState('WARNING_CROPPED')
        return
      }
      stableCountRef.current++
      const shouldAutoCapture =
        AUTO_CAPTURE_ENABLED === true &&
        qualityReady === true &&
        rectReady === true &&
        stableCountRef.current >= STABLE_REQUIRED &&
        !captureLockedRef.current
      console.log(
        `[AutoDecision] shouldAutoCapture=${shouldAutoCapture} ` +
        `AUTO_CAPTURE_ENABLED=${AUTO_CAPTURE_ENABLED} ` +
        `qualityReady=${qualityReady} rectReady=${rectReady} ` +
        `stableCount=${stableCountRef.current}/${STABLE_REQUIRED} ` +
        `locked=${captureLockedRef.current}`
      )
      if (shouldAutoCapture) {
        console.log('[AutoCapture] TRIGGER')
        setQualityState('READY')
        void capturePhotoRef.current?.('auto')
        return
      }
      if (stableCountRef.current >= STABLE_REQUIRED) {
        setQualityState('READY')
      } else {
        setQualityState('IDLE')
      }
    }, LIGHT_CHECK_INTERVAL_MS)
    return () => {
      if (qualityCheckIntervalRef.current) {
        clearInterval(qualityCheckIntervalRef.current)
        qualityCheckIntervalRef.current = null
      }
    }
  }, [cameraReady, capturing, guideBox]) // eslint-disable-line react-hooks/exhaustive-deps
  // ─── startPhysicalSession (Phase 1.5 보안 계약) ────────────────────────────
  const startPhysicalSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${NEO_API_BASE}/geocam/physical/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: navigator.userAgent.slice(0, 64), app_version: '4.3.0' }),
      })
      if (!res.ok) return false
      const data = await res.json()
      if (!data.success) return false
      physSessionRef.current = {
        scan_session_id: data.scan_session_id,
        nonce: data.nonce,
        expires_at: data.expires_at,
      }
      console.log('[PhysicalSession] started:', data.scan_session_id?.slice(0, 8))
      return true
    } catch (e) {
      console.warn('[PhysicalSession] start failed:', e)
      return false
    }
  }, [])
  // ─── runPhysicalVerify (v4.2: dinaId 유무에 따라 분기) ────────────────────
  // v4.3: STEP 2 — 아직 수정 없음, 기존 roiDataUrl 경로 유지
  const runPhysicalVerify = useCallback(async (roiDataUrl: string): Promise<void> => {
    setProcessing(true)
    try {
      if (isSignalOnlyMode) {
        console.log('[PhysicalVerify] SIGNAL_ONLY mode (no dinaId)')
        const result = await callDetectSignal(roiDataUrl)
        console.log('[DetectSignal]', result.verdict, 'overall:', result.overall_excess)
        if (result.verdict === 'SIGNAL_PRESENT') {
          setVerifyStatus('PRESENT')
        } else if (result.verdict === 'SIGNAL_UNCERTAIN') {
          setVerifyStatus('INSUFFICIENT_DATA')
        } else {
          setVerifyStatus('ABSENT')
        }
        navigateToScreen('result')
        setProcessing(false)
        return
      }
      if (!physSessionRef.current) {
        const ok = await startPhysicalSession()
        if (!ok) throw new Error('physical session unavailable')
      }
      const session = physSessionRef.current!
      const result = await callPhysicalVerify({
        scanSessionId: session.scan_session_id,
        nonce:         session.nonce,
        geocodeToken:  geocodeToken,
        roiDataUrl,
        cardProfileId: selectedCardProfile.id,
        authToken,
      })
      physSessionRef.current = null
      startPhysicalSession()
      console.log('[PhysicalVerify]',
        result.verdict,
        'hybrid:', result.hybrid_verdict,
        'reason:', result.reason_code,
        'verifyEventId:', result.verifyEventId,
        'canSave:', result.canSaveToMyCollection,
      )
      const verdict: PhysicalVerifyVerdict = result.verdict
      if (verdict === 'PHYSICAL VERIFIED') setVerifyStatus('PRESENT')
      else if (verdict === 'RETRY')        setVerifyStatus('INSUFFICIENT_DATA')
      else                                  setVerifyStatus('ABSENT')
      navigateToScreen('result')
    } catch (e) {
      console.error('[PhysicalVerify] error:', e)
      setNetworkError(true)
      setVerifyStatus('INSUFFICIENT_DATA')
      navigateToScreen('result')
    }
    setProcessing(false)
  }, [setProcessing, setNetworkError, setVerifyStatus, navigateToScreen, geocodeToken, selectedCardProfile, startPhysicalSession, isSignalOnlyMode])

  // ─── capturePhoto v4.3 (GEO-CAM-TRANSFER-001 STEP 2) ────────────────────────
  // 기존 canvas 캡처 경로 주석 처리
  // YuvCamera.capturePhotoFile() 호출 → path/uri/fileSize/mimeType 콘솔 출력
  // 서버 업로드 / multipart / SHA-256 / API 호출 수정 없음 (STEP 3에서 진행)
  const capturePhoto = useCallback(async (source: 'auto' | 'manual' = 'manual') => {
    console.log(`[AutoCapture] ENTER source=${source}`)
    if (captureLockedRef.current) {
      console.log(`[AutoCapture] SKIP_ALREADY_LOCKED source=${source}`)
      return
    }
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !cameraReady) {
      console.error(`[AutoCapture] ERROR guard failed source=${source} video=${!!video} canvas=${!!canvas} cameraReady=${cameraReady}`)
      captureLockedRef.current = false
      return
    }
    captureLockedRef.current = true
    console.log(`[AutoCapture] LOCKED source=${source}`)
    setCapturing(true)
    try {
      // ── [STEP 2] WebView 카메라 스트림 먼저 해제 — CameraX와 동시 점유 방지 ────
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      if (videoRef.current) videoRef.current.srcObject = null
      setCameraReady(false)
      // 스트림 해제 후 CameraX가 카메라를 열 수 있도록 짧게 대기
      await new Promise(resolve => setTimeout(resolve, 300))

      // ── [STEP 2] capturePhotoFile() 호출 — CameraX 네이티브 JPEG 파일 직접 생성 ──
      console.log('[STEP2] capturePhotoFile() 호출 시작')
      const photoResult = await (YuvCamera as any).capturePhotoFile()
      console.log('[STEP2] capturePhotoFile() 결과:')
      console.log('[STEP2]   path     :', photoResult.path)
      console.log('[STEP2]   uri      :', photoResult.uri)
      console.log('[STEP2]   fileSize :', photoResult.size)
      console.log('[STEP2]   mimeType :', photoResult.mimeType)

      // ── [CROP_CHECK] 좌표계 확인 로그 (제니팀장 지시) ──────────────────────
      console.log('[CROP_CHECK]', JSON.stringify({
        previewView: { width: cameraViewSize.w, height: cameraViewSize.h },
        videoFrame:  { width: videoRef.current?.videoWidth, height: videoRef.current?.videoHeight },
        guideBox,
        capturedPhoto: {
          width:        photoResult.width,
          height:       photoResult.height,
          exifRotation: photoResult.exifRotation,
        },
      }))

      // ── [STEP 2] 기존 canvas 캡처 경로 주석 처리 (STEP 3에서 교체 예정) ──────────
      // const roiDataUrl = await cropGuideBox()
      // ;(async () => {
      //   try {
      //     const pngBase64 = roiDataUrl.replace(/^data:image\/\w+;base64,/, '')
      //     const img = new Image()
      //     img.src = roiDataUrl
      //     await new Promise(r => { img.onload = r })
      //     console.log('[CardBoundary-2A-Input] source=cropGuideBox width=' + img.width + ' height=' + img.height)
      //     const nativeResult = await (YuvCamera as any).detectCardBoundaryFromPng({
      //       pngBase64,
      //       targetWidthMm:   selectedCardProfile.widthMm,
      //       targetHeightMm:  selectedCardProfile.heightMm,
      //       aspectTolerance: (selectedCardProfile as any).aspectTolerance ?? 0.15,
      //     })
      //     console.log('[CardBoundary-2A-Result] step=' + nativeResult.step ...)
      //   } catch (e) {
      //     console.warn('[CardBoundary-2A-Result] error:', e)
      //   }
      // })()
      // canvas.width  = video.videoWidth
      // canvas.height = video.videoHeight
      // const ctx2d = canvas.getContext('2d')
      // if (!ctx2d) throw new Error('capturePhoto: canvas context failed')
      // ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height)
      // const fullDataUrl = await canvasToPngBase64(canvas)
      // file:// URI → Capacitor WebView 호환 경로로 변환
      const { Capacitor } = await import('@capacitor/core')
      const displayUri = Capacitor.convertFileSrc(photoResult.path)
      setCapturedImage(displayUri)
      // try {
      //   const base64Data = fullDataUrl.replace(/^data:image\/\w+;base64,/, '')
      //   const fileName   = `legicam_${Date.now()}.png`
      //   await Filesystem.writeFile({
      //     path: fileName,
      //     data: base64Data,
      //     directory: Directory.Documents,
      //   })
      //   console.log('[Capture] 갤러리 저장 완료:', fileName)
      // } catch (e) {
      //   console.warn('[Capture] 갤러리 저장 실패:', e)
      // }

      // ── [STEP 3] 파일 바이트 읽기 → SHA-256 → multipart 업로드 ──────────────
      console.log('[STEP3] 파일 읽기 시작:', photoResult.path)

      // Capacitor Filesystem으로 파일 읽기 (base64)
      const fileData = await Filesystem.readFile({ path: photoResult.path })
      const base64Str = typeof fileData.data === 'string' ? fileData.data : ''

      // base64 → Uint8Array
      const binaryStr = atob(base64Str)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

      // 클라이언트 SHA-256 계산
      const hashBuf = await crypto.subtle.digest('SHA-256', bytes)
      const clientSha256 = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
      console.log('[STEP3] clientSha256:', clientSha256)
      console.log('[STEP3] clientFileSize:', photoResult.size)

      // multipart FormData 생성
      const blob = new Blob([bytes], { type: photoResult.mimeType })
      const formData = new FormData()
      formData.append('image', blob, 'geo_capture.jpg')
      formData.append('client_sha256', clientSha256)
      formData.append('client_file_size', String(photoResult.size))

      // 서버 전송
      console.log('[STEP3] multipart 전송 시작 → /physical/verify-file')
      const uploadRes = await fetch(`${NEO_API_BASE}/geocam/physical/verify-file`, {
        method: 'POST',
        body: formData,
      })

      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({}))
        console.error('[STEP3] 업로드 실패:', uploadRes.status, errBody)
        throw new Error(`verify-file error: ${uploadRes.status}`)
      }

      const uploadResult = await uploadRes.json()
      console.log('[STEP3] 서버 응답:', JSON.stringify(uploadResult))
      console.log('[STEP3] transferIntegrity:', uploadResult.transferIntegrity)
      console.log('[STEP3] clientSha256 :', uploadResult.clientSha256)
      console.log('[STEP3] serverSha256 :', uploadResult.serverSha256)
      console.log('[STEP3] serverFileSize:', uploadResult.serverFileSize)
      console.log('[STEP3] verdict       :', uploadResult.verdict)

      // SHA-256 일치 여부에 따라 결과 처리
      if (uploadResult.transferIntegrity === false) {
        console.error('[STEP3] SHA-256 불일치 → TRANSFER_INTEGRITY_FAIL')
        setVerifyStatus('INSUFFICIENT_DATA')
      } else if (uploadResult.verdict === 'SIGNAL_PRESENT') {
        setVerifyStatus('PRESENT')
      } else if (uploadResult.verdict === 'SIGNAL_UNCERTAIN') {
        setVerifyStatus('INSUFFICIENT_DATA')
      } else {
        setVerifyStatus('ABSENT')
      }
      navigateToScreen('result')

    } catch (e) {
      console.error('[capturePhoto] error:', e)
      resetCaptureLock('capture_failed')
    }
    setCapturing(false)
  }, [cameraReady, setCapturedImage, runPhysicalVerify, resetCaptureLock]) // eslint-disable-line react-hooks/exhaustive-deps

  // capturePhotoRef를 항상 최신 capturePhoto로 갱신
  useEffect(() => {
    capturePhotoRef.current = capturePhoto
  }, [capturePhoto])
  // ─── 카메라 시작/종료 ──────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        let cameraReadyFired = false
        const handleLoaded = () => {
          if (cameraReadyFired) return
          cameraReadyFired = true
          videoRef.current?.play().then(() => {
            setCameraReady(true)
            setCameraError(null)
            console.log('[Camera] ready: stream loaded and playing')
          }).catch((e: unknown) => {
            console.error('[Camera] play error:', e)
            setCameraReady(true)
            setCameraError(null)
          })
        }
        videoRef.current.addEventListener('loadedmetadata', handleLoaded, { once: true })
        videoRef.current.addEventListener('canplay', handleLoaded, { once: true })
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermissionDenied(true)
          setCameraError(t('camera.permission'))
        } else {
          setCameraError(t('camera.error'))
        }
      }
    }
  }, [t, setCameraError])
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraReady(false)
  }, [])
  useEffect(() => {
    startCamera()
    if (!isSignalOnlyMode) {
      startPhysicalSession()
    }
    return () => { stopCamera() }
  }, [startCamera, stopCamera, startPhysicalSession, isSignalOnlyMode])
  const handleBack = useCallback(() => {
    stopCamera()
    navigateToScreen('sizeSelect')
  }, [stopCamera, navigateToScreen])
  const handleGuideConfirm = useCallback(() => {
    setShowGuideOverlay(false)
    resetCaptureLock('guide_confirm')
  }, [resetCaptureLock])
  const guideColor  = getGuideColor()
  const bannerText  = getBannerText()
  const bannerStyle = getBannerStyle()
  const cornerStyle = (pos: object) => ({
    position: 'absolute' as const,
    width: '36px',
    height: '36px',
    ...pos,
  })
  // ─── 에러 화면 ──────────────────────────────────────────────────────────────
  if (permissionDenied || cameraError) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: '#0a0a0c', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center' }}>
          <button onClick={handleBack} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <BackArrow />
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <p style={{ color: '#f87171', fontSize: '16px', marginBottom: '8px' }}>{t('camera.error')}</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', textAlign: 'center', maxWidth: '260px', lineHeight: '1.6', marginBottom: '28px' }}>{cameraError}</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleBack} style={{ padding: '12px 22px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: '14px', cursor: 'pointer' }}>{t('camera.home')}</button>
            <button onClick={startCamera} style={{ padding: '12px 22px', borderRadius: '10px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', color: '#4ade80', fontSize: '14px', cursor: 'pointer' }}>{t('common.retry')}</button>
          </div>
        </div>
      </div>
    )
  }

  const guides = [
    { num: '01', title: '카드를 평평한 곳에 놓으세요', desc: '손으로 들지 말고 테이블 위에 올려주세요.' },
    { num: '02', title: '카드 전체가 박스 안에 살짝 여유 있게 들어오게 맞춰주세요', desc: '카드 모서리가 박스 선에 닿거나 잘리지 않아야 합니다.' },
    { num: '03', title: '기기를 살짝 기울여 반사광을 피해주세요', desc: '조명이 카드에 직접 반사되지 않도록 각도를 조절하세요.' },
    { num: '04', title: '20~25cm 거리에서 촬영하세요', desc: '너무 가까우면 초점이 흐려집니다.' },
    { num: '05', title: '흔들리지 않게 촬영하세요', desc: '촬영 버튼을 누를 때 스마트폰을 고정하세요.' },
  ]
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', display: 'flex', flexDirection: 'column' }}>
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
        <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        {!cameraReady && !cameraError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)' }}>
            <div style={{ position: 'relative', width: '72px', height: '72px', marginBottom: '20px' }}>
              <svg viewBox="0 0 72 72" style={{ width: '72px', height: '72px', transform: 'rotate(-90deg)', animation: 'spin 1.5s linear infinite' }}>
                <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(167,139,250,0.2)" strokeWidth="4" />
                <circle cx="36" cy="36" r="30" fill="none" stroke="#a78bfa" strokeWidth="4" strokeDasharray="60 130" strokeLinecap="round" />
              </svg>
              <style>{`@keyframes spin { to { transform: rotate(270deg); } }`}</style>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', fontWeight: '300', letterSpacing: '0.05em', marginBottom: '8px' }}>정품 확인 중입니다</p>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px', fontWeight: '300', letterSpacing: '0.03em' }}>잠시만 기다려 주세요.</p>
          </div>
        )}
        {cameraReady && (
          <div style={{ position: 'absolute', top: 'max(90px, calc(env(safe-area-inset-top) + 74px))', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 15, pointerEvents: 'none' }}>
            <div style={{ background: bannerStyle.bg, border: bannerStyle.border, borderRadius: '20px', padding: '5px 16px', transition: 'all 0.3s ease' }}>
              <p style={{ color: bannerStyle.color, fontSize: '12px', fontWeight: '300', letterSpacing: '0.04em', textAlign: 'center' }}>
                {bannerText}
              </p>
            </div>
          </div>
        )}
        {cameraReady && guideBox.w > 0 && (
          <div style={{ position: 'absolute', left: `${guideBox.x}px`, top: `${guideBox.y}px`, width: `${guideBox.w}px`, height: `${guideBox.h}px`, pointerEvents: 'none', zIndex: 10 }}>
            <div style={{ ...cornerStyle({ top: 0, left: 0 }), borderTop: `2px solid ${guideColor}`, borderLeft: `2px solid ${guideColor}`, borderTopLeftRadius: '8px' }} />
            <div style={{ ...cornerStyle({ top: 0, right: 0 }), borderTop: `2px solid ${guideColor}`, borderRight: `2px solid ${guideColor}`, borderTopRightRadius: '8px' }} />
            <div style={{ ...cornerStyle({ bottom: 0, left: 0 }), borderBottom: `2px solid ${guideColor}`, borderLeft: `2px solid ${guideColor}`, borderBottomLeftRadius: '8px' }} />
            <div style={{ ...cornerStyle({ bottom: 0, right: 0 }), borderBottom: `2px solid ${guideColor}`, borderRight: `2px solid ${guideColor}`, borderBottomRightRadius: '8px' }} />
            {safeAreaBox.w > 0 && (
              <div style={{
                position: 'absolute',
                left: `${safeAreaBox.x - guideBox.x}px`,
                top: `${safeAreaBox.y - guideBox.y}px`,
                width: `${safeAreaBox.w}px`,
                height: `${safeAreaBox.h}px`,
                border: '1px dashed rgba(255,255,255,0.18)',
                borderRadius: '4px',
                pointerEvents: 'none',
              }} />
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
          {capturing ? '처리 중...' : isSignalOnlyMode ? '카드를 박스에 맞춘 후 촬영 (신호 검출)' : '카드를 박스에 맞춘 후 촬영'}
        </p>
        <button
          onClick={() => capturePhoto('manual')}
          disabled={!cameraReady || capturing}
          style={{ width: '72px', height: '72px', borderRadius: '50%', background: cameraReady && !capturing ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.2)', border: '3px solid rgba(255,255,255,0.2)', cursor: cameraReady && !capturing ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.1s' }}
        >
          {capturing
            ? <svg width="28" height="28" viewBox="0 0 32 32" fill="none" style={{ animation: 'spin 1s linear infinite' }}><circle cx="16" cy="16" r="14" stroke="#0a0a0c" strokeWidth="2" strokeDasharray="8 4" /></svg>
            : <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: cameraReady ? '#0a0a0c' : 'rgba(0,0,0,0.2)' }} />
          }
        </button>
      </div>

      {/* 촬영 안내 오버레이 */}
      {showGuideOverlay && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', maxHeight: '80vh', overflowY: 'auto', background: '#111', borderRadius: '20px 20px 0 0', padding: '24px', paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ color: 'rgba(255,255,255,0.85)', fontSize: '16px', fontWeight: '400', letterSpacing: '0.06em', margin: 0 }}>
                촬영 전 확인사항
              </h2>
              <button onClick={() => setShowGuideOverlay(false)} style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
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
              확인 — 촬영 시작
            </button>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <canvas ref={qualityCanvasRef} style={{ display: 'none' }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
export default CameraScreen
