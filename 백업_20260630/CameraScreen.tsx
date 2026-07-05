// CameraScreen.tsx v4.2
// LC-CAM-001 v4.0 LOCK 기준 + v4.2 CardGate 재설계
// 작성: 짱아 / 2026-06-30
//
// v4.0: AUTO_CAPTURE_ENABLED=false 복원, HybridVerifyResult 타입, resetCaptureLock()
// v4.1 (2026-06-30): NeoStudio /physical/verify 경유로 전환
//   - 클라이언트가 GeoStudio detect-hybrid-v3를 직접 호출하지 않음 (Phase 1.5 보안 계약)
//   - geocode_token(dina_id)만 전송, 서버가 내부 매핑 + 검출 + claim + ownership 처리
//   - startPhysicalSession() 재활성화
//   - verifyEventId 응답 수신 (LC-005 MyCollection 저장에서 사용 예정)
// v4.2 (2026-06-30, 빅보스 승인): RectGate(밴드 내부 텍스처 측정) 전면 폐기.
//   원인: 가이드박스 안쪽 텍스처만 측정 → 손/배경도 텍스처 있으면 통과 (misfire 근본원인)
//   교체: CardGate 신규 도입 (LT-ARCH-001 §14.4 Card Gate 스펙 기준)
//     - 가이드박스 경계 자체에서 실제 카드-배경 경계선 탐지 (패딩 포함 별도 샘플)
//     - aspectOk / sizeOk / centerOk / skinReject 4개 항목 종합판정
//     - 로그포맷: [CardGate] aspectOk= sizeOk= centerOk= skinReject= (LT-ARCH-001 §21 LOCK)
//   v4.0 §33 "엣지 기반 탐지 재도입 금지" 조항 폐기(빅보스 명시 확정).
//   단, cropGuideBox()(실제 검증 전송 캡처)는 변경 없음 — "crop margin 적용 금지"는 유지.
//
// 금지(v4.0 §33, v4.2 갱신):
//   - crop margin 적용 (cropGuideBox 자체에는 여전히 금지)
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
const STABLE_REQUIRED         = 4     // 250ms x 4 = 1.0초 (손떨림 대비 완화)

// ─── CardGate 상수 (v4.2, LT-ARCH-001 §14.4 Card Gate 스펙) ─────────────────
// 주의: 아래 값들은 알고리즘 설계상 초기 추정값. 실기기 테스트 후 튜닝 필요.
const CARDGATE_PAD_RATIO            = 0.18  // 가이드박스 기준 외곽 패딩 비율 (경계탐지용 여유공간)
const CARDGATE_SAMPLE_W             = 200   // 패딩 포함 샘플 캔버스 가로 픽셀
const CARDGATE_EDGE_DELTA_MIN       = 14    // 엣지 후보로 인정할 최소 명암 변화량
const CARDGATE_LINE_CONSISTENCY_MIN = 0.55  // 후보 라인 일관성 최소값 (낮으면 직선아님=손/배경)
const CARDGATE_ASPECT_TOLERANCE     = 0.18  // 종횡비 허용오차 (18%)
const CARDGATE_SIZE_MIN_RATIO       = 0.55  // 감지된 카드의 가이드박스 대비 최소 점유율
const CARDGATE_SIZE_MAX_RATIO       = 1.35  // 최대 점유율
const CARDGATE_CENTER_TOLERANCE     = 0.20  // 중앙정렬 허용오차 (가이드박스 크기 대비 비율)
const CARDGATE_MIN_EDGES_FOUND      = 3     // 4변 중 최소 통과 변 수
const SKIN_BAND_RATIO_REJECT        = 0.55  // 안쪽 영역 skin-tone 비율 이 값 이상이면 reject

// 자동 캡처 (v4.0 LOCK §10: false — 수동 촬영이 메인)
const AUTO_CAPTURE_ENABLED    = true
const AUTO_CAPTURE_DELAY_MS   = 300  // LC-CAM-AUTO-004: 즉시 호출로 변경되어 현재 미사용

// 디버그 (운영 빌드 시 false)
const DEBUG_CROP_LOG          = true

// API
const GEO_API_BASE  = 'https://geo-api.artionchain.com/api'
const NEO_API_BASE  = 'https://neo-api.artionchain.com/api'
// const TEST_CANDIDATE = 'C'  // detect-layer2 전용 (디버그/회귀 테스트용, v4.0 §9.2)

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

// ─── skin-tone 판정 (YCbCr 기준, v4.2 신규) ─────────────────────────────────
function isSkinPixel(r: number, g: number, b: number): boolean {
  const y  =  0.299 * r + 0.587 * g + 0.114 * b
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
  return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && y > 60
}

// ─── CardGate (v4.2 신규, LT-ARCH-001 §14.4 Card Gate 스펙) ─────────────────
// 기존 RectGate(가이드박스 안쪽 텍스처 측정)를 전면 폐기하고,
// 가이드박스 "경계" 자체에서 실제 카드-배경 경계선을 찾는 방식으로 재설계.
// imageData는 가이드박스 기준 패딩(CARDGATE_PAD_RATIO) 포함한 더 넓은 샘플이어야 함.
// guideBoxInSample = 그 패딩 포함 샘플 안에서 원본 가이드박스가 차지하는 좌표.
interface CardGateResult {
  ok: boolean
  aspectOk: boolean
  sizeOk: boolean
  centerOk: boolean
  skinReject: boolean
  edgeFoundCount: number
}

function detectCardGate(
  imageData: ImageData,
  guideBoxInSample: { x: number; y: number; w: number; h: number },
  searchRadiusPx: number,
  expectedAspectHOverW: number,
): CardGateResult {
  const { width, height, data } = imageData

  const gray = (x: number, y: number): number => {
    const xi = Math.min(width - 1, Math.max(0, Math.round(x)))
    const yi = Math.min(height - 1, Math.max(0, Math.round(y)))
    const idx = (yi * width + xi) * 4
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
  }

  // 가이드박스 한 변 근처에서 실제 명암 경계선(엣지) 위치를 찾는다.
  // sampleAt(cross, along): cross=경계선과 수직인 축 좌표, along=경계선과 평행한 축 좌표
  function searchEdge(
    alongRange: [number, number],
    expectedCross: number,
    sampleAt: (cross: number, along: number) => number,
  ): { pos: number; found: boolean } {
    const ALONG_SAMPLES = 7
    const candidates: number[] = []
    const [alongFrom, alongTo] = alongRange

    for (let s = 0; s < ALONG_SAMPLES; s++) {
      const along = alongFrom + (alongTo - alongFrom) * (s + 0.5) / ALONG_SAMPLES
      let bestDelta = 0
      let bestPos = -1
      const from = expectedCross - searchRadiusPx
      const to   = expectedCross + searchRadiusPx
      for (let c = from; c < to; c += 1) {
        const v1 = sampleAt(c - 1.5, along)
        const v2 = sampleAt(c + 1.5, along)
        const delta = Math.abs(v2 - v1)
        if (delta > bestDelta) {
          bestDelta = delta
          bestPos = c
        }
      }
      if (bestDelta > CARDGATE_EDGE_DELTA_MIN) candidates.push(bestPos)
    }

    if (candidates.length < Math.ceil(ALONG_SAMPLES * 0.5)) {
      return { pos: expectedCross, found: false }
    }

    const sorted = [...candidates].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const closeCount = candidates.filter(p => Math.abs(p - median) <= searchRadiusPx * 0.3).length
    const consistency = closeCount / ALONG_SAMPLES

    return { pos: median, found: consistency >= CARDGATE_LINE_CONSISTENCY_MIN }
  }

  const { x: bx, y: by, w: bw, h: bh } = guideBoxInSample

  const top    = searchEdge([bx, bx + bw], by,      (c, a) => gray(a, c))
  const bottom = searchEdge([bx, bx + bw], by + bh,  (c, a) => gray(a, c))
  const left   = searchEdge([by, by + bh], bx,       (c, a) => gray(c, a))
  const right  = searchEdge([by, by + bh], bx + bw,  (c, a) => gray(c, a))

  const edgeFoundCount = [top, bottom, left, right].filter(e => e.found).length

  let aspectOk = false
  let sizeOk = false
  let centerOk = false

  if (edgeFoundCount >= CARDGATE_MIN_EDGES_FOUND) {
    const dTop    = top.found    ? top.pos    : by
    const dBottom = bottom.found ? bottom.pos : by + bh
    const dLeft   = left.found   ? left.pos   : bx
    const dRight  = right.found  ? right.pos  : bx + bw

    const dW = Math.max(1, dRight - dLeft)
    const dH = Math.max(1, dBottom - dTop)

    const aspect = dH / dW
    aspectOk = Math.abs(aspect - expectedAspectHOverW) / expectedAspectHOverW <= CARDGATE_ASPECT_TOLERANCE

    const sizeRatio = (dW * dH) / (bw * bh)
    sizeOk = sizeRatio >= CARDGATE_SIZE_MIN_RATIO && sizeRatio <= CARDGATE_SIZE_MAX_RATIO

    const cx = (dLeft + dRight) / 2
    const cy = (dTop + dBottom) / 2
    const boxCx = bx + bw / 2
    const boxCy = by + bh / 2
    const centerOffset = Math.hypot(cx - boxCx, cy - boxCy)
    centerOk = centerOffset <= Math.max(bw, bh) * CARDGATE_CENTER_TOLERANCE
  }

  // skin-tone reject: 가이드박스 안쪽(패딩 제외) 영역 샘플
  let skinCount = 0
  let totalCount = 0
  const stepX = Math.max(1, Math.floor((bw * 0.8) / 24))
  const stepY = Math.max(1, Math.floor((bh * 0.8) / 24))
  for (let y = by + bh * 0.1; y < by + bh * 0.9; y += stepY) {
    for (let x = bx + bw * 0.1; x < bx + bw * 0.9; x += stepX) {
      const xi = Math.min(width - 1, Math.round(x))
      const yi = Math.min(height - 1, Math.round(y))
      const idx = (yi * width + xi) * 4
      if (isSkinPixel(data[idx], data[idx + 1], data[idx + 2])) skinCount++
      totalCount++
    }
  }
  const skinRatio = totalCount > 0 ? skinCount / totalCount : 0
  const skinReject = skinRatio >= SKIN_BAND_RATIO_REJECT

  const ok = edgeFoundCount >= CARDGATE_MIN_EDGES_FOUND && aspectOk && sizeOk && centerOk && !skinReject

  return { ok, aspectOk, sizeOk, centerOk, skinReject, edgeFoundCount }
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
}): Promise<PhysicalVerifyApiResult> {
  const { scanSessionId, nonce, geocodeToken, roiDataUrl, cardProfileId } = params

  const roiHash = await sha256Base64(roiDataUrl)
  const regionImage = roiDataUrl.replace(/^data:image\/\w+;base64,/, '')

  const res = await fetch(`${NEO_API_BASE}/geocam/physical/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

// ─── CameraScreen v4.2 ────────────────────────────────────────────────────────

const CameraScreen = ({
  safeGoHome, runPipeline, BackArrow, sessionToken, nonce, dinaId, qrData,
  selectedCardProfile,
  setCapturedImage, setConfidence, setMatchScore, setVerifyStatus, setRecordInfo,
  setErrorCode, setNetworkError, setProcessing, navigateToScreen, cameraError, setCameraError,
}: CameraScreenProps) => {
  const { t } = useTranslation()

  // ─── refs ──────────────────────────────────────────────────────────────────
  const videoRef               = useRef<HTMLVideoElement>(null)
  const canvasRef              = useRef<HTMLCanvasElement>(null)
  const qualityCanvasRef       = useRef<HTMLCanvasElement>(null)
  const cardGateCanvasRef      = useRef<HTMLCanvasElement>(null)  // v4.2 신규: CardGate용 패딩샘플
  const streamRef              = useRef<MediaStream | null>(null)
  const captureLockedRef       = useRef(false)
  const qualityCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stableCountRef         = useRef(0)
  const cardGateHistoryRef     = useRef<boolean[]>([])  // 최근 프레임 CardGate 결과 이력 (손떨림 흡수용)
  // capturePhotoRef: setInterval 클로저가 항상 최신 capturePhoto를 참조하도록 함
  // (LC-CAM-AUTO-003: useEffect deps에 capturePhoto가 빠져 stale 클로저로
  //  cameraReady=false였던 mount시점 함수를 영원히 참조하던 버그 수정)
  const capturePhotoRef        = useRef<((source?: 'auto' | 'manual') => Promise<void>) | null>(null)
  // physSessionRef — Phase 1.5 보안 계약: scan_session_id + nonce 보관
  const physSessionRef = useRef<{ scan_session_id: string; nonce: string; expires_at: string } | null>(null)
  const cameraViewRef          = useRef<HTMLDivElement>(null)

  // ─── state ─────────────────────────────────────────────────────────────────
  const [cameraReady, setCameraReady]           = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [capturing, setCapturing]               = useState(false)
  const [qualityState, setQualityState]         = useState<QualityState>('IDLE')
  const [showGuideOverlay, setShowGuideOverlay] = useState(true)
  const [cameraViewSize, setCameraViewSize]     = useState({ w: 0, h: 0 })

  const geocodeToken = dinaId || qrData || 'TEST-DINA-LAYER2-001'

  void sessionToken; void nonce; void runPipeline; void API_BASE_URL
  void setConfidence; void setMatchScore; void setRecordInfo; void setErrorCode

  // ─── resetCaptureLock (v4.0 LOCK §13) ───────────────────────────────────────
  const resetCaptureLock = useCallback((reason: string) => {
    captureLockedRef.current = false
    cardGateHistoryRef.current = []
    if (DEBUG_CROP_LOG) console.log('[captureLock] reset:', reason)
  }, [])

  // ─── captureLockedRef 초기화 (mount/focus 진입) ────────────────────────────
  useEffect(() => {
    resetCaptureLock('mount')
    return () => {
      captureLockedRef.current = true  // unmount 시 잠금 유지
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

  // ─── cropGuideBox (v4.0 LOCK §16) — v4.2에서도 변경 없음 ──────────────────
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

  // ─── 품질 체크 루프 (v4.0 LOCK §14 + v4.2 CardGate 교체) ──────────────────
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

      // 제니팀장 LC-CAM-AUTO-002 5번 지적: 화면 표시 좌표(guideBox)를
      // video 원본 좌표로 보정 없이 그대로 쓰면 안 됨.
      // cropGuideBox()와 동일한 scale/offset 보정을 적용해야 실제 카드 위치와 일치함.
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

      // ─── CardGate (v4.2 신규) ────────────────────────────────────────────
      // RectGate(가이드박스 안쪽 텍스처 측정) 폐기 → 가이드박스 경계에서
      // 실제 카드-배경 경계선을 탐지하는 방식으로 교체 (LT-ARCH-001 §14.4)
      // 패딩 포함한 별도 샘플(cardGateCanvasRef)에서 동작 — qualityCanvasRef와 무관.
      let cardReady = false

      const cgCanvas = cardGateCanvasRef.current
      if (cgCanvas) {
        const padPxPreviewX = guideBox.w * CARDGATE_PAD_RATIO
        const padPxPreviewY = guideBox.h * CARDGATE_PAD_RATIO
        const paddedX = guideBox.x - padPxPreviewX
        const paddedY = guideBox.y - padPxPreviewY
        const paddedW = guideBox.w + 2 * padPxPreviewX
        const paddedH = guideBox.h + 2 * padPxPreviewY

        const cgVideoCropX = Math.max(0, (paddedX + qOffsetX) / qScale)
        const cgVideoCropY = Math.max(0, (paddedY + qOffsetY) / qScale)
        const cgVideoCropW = Math.min(paddedW / qScale, videoW2 - cgVideoCropX)
        const cgVideoCropH = Math.min(paddedH / qScale, videoH2 - cgVideoCropY)

        if (cgVideoCropW > 0 && cgVideoCropH > 0) {
          const cgSampleW = CARDGATE_SAMPLE_W
          const cgSampleH = Math.round(cgSampleW * (cgVideoCropH / cgVideoCropW))
          cgCanvas.width  = cgSampleW
          cgCanvas.height = cgSampleH
          const cgCtx = cgCanvas.getContext('2d', { willReadFrequently: true })

          if (cgCtx) {
            cgCtx.drawImage(
              video,
              cgVideoCropX, cgVideoCropY, cgVideoCropW, cgVideoCropH,
              0, 0, cgSampleW, cgSampleH,
            )
            const cgImageData = cgCtx.getImageData(0, 0, cgSampleW, cgSampleH)

            // 패딩 포함 샘플 안에서 원본 가이드박스가 차지하는 좌표 계산
            const guideBoxInSample = {
              x: cgSampleW * (padPxPreviewX / paddedW),
              y: cgSampleH * (padPxPreviewY / paddedH),
              w: cgSampleW * (guideBox.w / paddedW),
              h: cgSampleH * (guideBox.h / paddedH),
            }
            const searchRadiusPx = Math.min(
              cgSampleW * (padPxPreviewX / paddedW),
              cgSampleH * (padPxPreviewY / paddedH),
            )

            const cardGate = detectCardGate(
              cgImageData,
              guideBoxInSample,
              searchRadiusPx,
              selectedCardProfile.aspectHOverW,
            )

            console.log(
              `[CardGate] aspectOk=${cardGate.aspectOk} sizeOk=${cardGate.sizeOk} ` +
              `centerOk=${cardGate.centerOk} skinReject=${cardGate.skinReject} ` +
              `edgeFound=${cardGate.edgeFoundCount}/4 ok=${cardGate.ok}`
            )

            cardGateHistoryRef.current.push(cardGate.ok)
            if (cardGateHistoryRef.current.length > 4) cardGateHistoryRef.current.shift()
            const recentPassCount = cardGateHistoryRef.current.filter(Boolean).length
            cardReady = recentPassCount >= 2  // 최근 4프레임 중 2개 이상 통과하면 카드 있다고 판정
          }
        } else {
          console.warn('[CardGate] invalid padded crop, skip this tick')
        }
      }

      const qualityReady = true // 이 지점 도달 = brightness/blur/glare 전부 통과한 상태
      console.log(`[AutoGate] qualityReady=${qualityReady} cardReady=${cardReady} autoCaptureLocked=${captureLockedRef.current} stableCount=${stableCountRef.current}/${STABLE_REQUIRED}`)

      if (!cardReady) {
        stableCountRef.current = Math.max(0, stableCountRef.current - 1)
        setQualityState('WARNING_CROPPED')
        return
      }

      stableCountRef.current++

      // ─── LC-CAM-AUTO-004: 자동촬영 호출부 (제니팀장 지시, 2026-06-30) ──────
      // 조건 재분석 금지. AutoGate 로그 바로 아래에서 shouldAutoCapture를
      // 명시적으로 계산하고, 참이면 즉시(setTimeout 없이) capturePhoto('auto') 호출.
      const shouldAutoCapture =
        AUTO_CAPTURE_ENABLED === true &&
        qualityReady === true &&
        cardReady === true &&
        stableCountRef.current >= STABLE_REQUIRED &&
        captureLockedRef.current !== true

      console.log(
        `[AutoDecision] shouldAutoCapture=${shouldAutoCapture} ` +
        `AUTO_CAPTURE_ENABLED=${AUTO_CAPTURE_ENABLED} ` +
        `qualityReady=${qualityReady} cardReady=${cardReady} ` +
        `stableCount=${stableCountRef.current}/${STABLE_REQUIRED} ` +
        `locked=${captureLockedRef.current}`
      )

      if (shouldAutoCapture) {
        console.log('[AutoCapture] TRIGGER')
        setQualityState('READY')
        // capturePhotoRef를 통해 즉시 호출 (stale 클로저 방지, LC-CAM-AUTO-003)
        // 잠금은 capturePhoto('auto') 내부 ENTER 직후에 건다 (제니팀장 지시 구조)
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
  }, [cameraReady, capturing, guideBox, selectedCardProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── startPhysicalSession (Phase 1.5 보안 계약) ────────────────────────────
  const startPhysicalSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${NEO_API_BASE}/geocam/physical/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: navigator.userAgent.slice(0, 64), app_version: '4.2.0' }),
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

  // ─── runPhysicalVerify (v4.1: NeoStudio physical/verify 경유) ─────────────
  // Phase 1.5 보안 계약: 앱은 dina_id를 GeoStudio에 직접 보내지 않음
  // geocode_token만 NeoStudio에 전송 → 서버가 내부 매핑 + detect-hybrid-v3 + claim + ownership 처리
  //
  // 판정 매핑 (v4.0 §20):
  //   PHYSICAL VERIFIED → setVerifyStatus('PRESENT')
  //   RETRY             → setVerifyStatus('INSUFFICIENT_DATA')
  //   INVALID           → setVerifyStatus('ABSENT')
  const runPhysicalVerify = useCallback(async (roiDataUrl: string): Promise<void> => {
    setProcessing(true)
    try {
      // 세션이 없으면 재발급 시도 (촬영 전 미발급/만료 대비)
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
      })

      // 세션은 1회성 (서버에서 USED 처리) — 다음 촬영을 위해 즉시 재발급
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

      // TODO(LC-005): result.canSaveToMyCollection && result.verifyEventId 일 때
      // MyCollection 저장 플로우 연결 (v4.0 §26)

      navigateToScreen('result')

    } catch (e) {
      console.error('[PhysicalVerify] error:', e)
      setNetworkError(true)
      setVerifyStatus('INSUFFICIENT_DATA')
      navigateToScreen('result')
    }
    setProcessing(false)
  }, [setProcessing, setNetworkError, setVerifyStatus, navigateToScreen, geocodeToken, selectedCardProfile, startPhysicalSession])

  // ─── 수동 촬영 (메인, v4.0 LOCK §9.2) ──────────────────────────────────────
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
      const roiDataUrl = await cropGuideBox()

      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      const ctx2d = canvas.getContext('2d')
      if (!ctx2d) throw new Error('capturePhoto: canvas context failed')
      ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height)
      const fullDataUrl = await canvasToPngBase64(canvas)
      setCapturedImage(fullDataUrl)

      try {
        const base64Data = fullDataUrl.replace(/^data:image\/\w+;base64,/, '')
        const fileName   = `legicam_${Date.now()}.png`
        await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Documents,
        })
        console.log('[Capture] 갤러리 저장 완료:', fileName)
      } catch (e) {
        console.warn('[Capture] 갤러리 저장 실패:', e)
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      if (videoRef.current) videoRef.current.srcObject = null
      setCameraReady(false)

      await runPhysicalVerify(roiDataUrl)

    } catch (e) {
      console.error('[capturePhoto] error:', e)
      resetCaptureLock('capture_failed')  // v4.0 §13: 예외/실패 시만 복원
    }

    setCapturing(false)
  }, [cameraReady, cropGuideBox, setCapturedImage, runPhysicalVerify, resetCaptureLock])

  // capturePhotoRef를 항상 최신 capturePhoto로 갱신 (LC-CAM-AUTO-003 stale 클로저 방지)
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
        // Android WebView: onloadedmetadata 미발생 케이스 대비
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
    startPhysicalSession()
    return () => { stopCamera() }
  }, [startCamera, stopCamera, startPhysicalSession])

  const handleBack = useCallback(() => {
    stopCamera()
    navigateToScreen('sizeSelect')
  }, [stopCamera, navigateToScreen])

  // ─── focus 복귀 시 resetCaptureLock (v4.0 LOCK §13) ────────────────────────
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

  // ─── 촬영 안내 오버레이 (v4.0 LOCK §18) ─────────────────────────────────────
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
            {t('capture.title')}
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

        {/* 로딩 */}
        {!cameraReady && !cameraError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)' }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', letterSpacing: '0.05em' }}>{t('camera.loading')}</p>
          </div>
        )}

        {/* 배너 */}
        {cameraReady && (
          <div style={{ position: 'absolute', top: 'max(90px, calc(env(safe-area-inset-top) + 74px))', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 15, pointerEvents: 'none' }}>
            <div style={{ background: bannerStyle.bg, border: bannerStyle.border, borderRadius: '20px', padding: '5px 16px', transition: 'all 0.3s ease' }}>
              <p style={{ color: bannerStyle.color, fontSize: '12px', fontWeight: '300', letterSpacing: '0.04em', textAlign: 'center' }}>
                {bannerText}
              </p>
            </div>
          </div>
        )}

        {/* 고정 가이드박스 */}
        {cameraReady && guideBox.w > 0 && (
          <div style={{ position: 'absolute', left: `${guideBox.x}px`, top: `${guideBox.y}px`, width: `${guideBox.w}px`, height: `${guideBox.h}px`, pointerEvents: 'none', zIndex: 10 }}>
            <div style={{ ...cornerStyle({ top: 0, left: 0 }), borderTop: `2px solid ${guideColor}`, borderLeft: `2px solid ${guideColor}`, borderTopLeftRadius: '8px' }} />
            <div style={{ ...cornerStyle({ top: 0, right: 0 }), borderTop: `2px solid ${guideColor}`, borderRight: `2px solid ${guideColor}`, borderTopRightRadius: '8px' }} />
            <div style={{ ...cornerStyle({ bottom: 0, left: 0 }), borderBottom: `2px solid ${guideColor}`, borderLeft: `2px solid ${guideColor}`, borderBottomLeftRadius: '8px' }} />
            <div style={{ ...cornerStyle({ bottom: 0, right: 0 }), borderBottom: `2px solid ${guideColor}`, borderRight: `2px solid ${guideColor}`, borderBottomRightRadius: '8px' }} />

            {/* safe area 안내 (v4.0 §12: UI 안내용, crop 기준 아님) */}
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
          {capturing ? '처리 중...' : '카드를 박스에 맞춘 후 촬영'}
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
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 30, padding: '0' }}>
          <div style={{ width: '100%', maxWidth: '480px', padding: '32px 24px', paddingBottom: 'max(32px, env(safe-area-inset-bottom))', overflowY: 'auto', maxHeight: '100vh' }}>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', letterSpacing: '0.2em', fontWeight: '300', marginBottom: '6px', textAlign: 'center' }}>
              BEFORE YOU SHOOT
            </p>
            <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '20px', fontWeight: '200', letterSpacing: '0.04em', marginBottom: '20px', textAlign: 'center' }}>
              촬영 전 확인사항
            </h2>
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
      <canvas ref={cardGateCanvasRef} style={{ display: 'none' }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default CameraScreen