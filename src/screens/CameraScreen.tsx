import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { API_BASE_URL } from '../api/client'
import type { CameraScreenProps } from '../types/app.types'

// W4-1 정정 (2026-04-27, P0-5 LT-ENGINE v0.2 § 4 + AUDIT-001 v1.1 § 4 + 빅보스 D1/D2/D4 LOCK):
// - GeoStudio 직접 호출 URL 상수 제거 (D4: NeoStudio 프록시 강제)
// - 클라이언트 API 키 상수 제거 (D4: 클라이언트 키 노출 금지)
// - runModeB URL: GeoStudio physical detect → NeoStudio /geocam/detect-only
// - API 키 헤더 제거 (D4 정합)
// - 응답 매핑: 4-state 결과 필드 → pattern_result (PRESENT/WEAK/ABSENT)
//   * WEAK → INSUFFICIENT_DATA (W2 정합 - False Positive 방지)
// - 이미지 유사도 점수 호출 제거 (D1: GC-SPEC-013 v0.5 § 1.5 위반)
// - 4-state 폴백 → 'INSUFFICIENT_DATA' (D2: 3-state 단일)
//
// W4-2 정정 (2026-04-28, 빅보스 D3 LOCK + 메모리 #1 NeoSystem 3레이어 OFFICIAL LOCK):
// - 메모리 #1 LOCK: 정품판단 = 오직 GeoCode (CameraScreen)
//                   QR/DINA = 정체성 (ScanScreen 별도)
//                   Event = 이력 (ScanResultScreen 별도)
// - autoCapture Mode A/C 분기 제거 → runModeB 단일 호출
// - capturePhoto Mode A/C 분기 제거 → runModeB 단일 호출
// - CameraScreen = GeoCode 물리 검증 단독 책임
// - QR/DINA/Gate A/B/C 검증 로직 완전 제거 (ScanScreen + ScanResultScreen으로 분리)
// 보류:
//   * dinaId/sessionToken/nonce/qrData props 시그니처 유지 (빅보스 명시 보류)
//   * setMatchScore/setConfidence/setRecordInfo props 시그니처 유지

// LT-SPEC-002 v1.3 LOCK detection parameters
const DETECT_INTERVAL_MS    = 150
const PROCESS_WIDTH         = 320
const PROCESS_HEIGHT        = 240
const CARD_RATIO            = 55 / 85
const RATIO_TOLERANCE       = 0.08
const MIN_CARD_AREA_RATIO   = 0.25
const MAX_CARD_AREA_RATIO   = 0.80
const STABLE_FRAMES         = 8
const STABLE_POS_TOLERANCE  = 8
const SPEED_THRESHOLD       = 3
const LERP_FACTOR           = 0.25
const WEIGHT_AREA           = 0.4
const WEIGHT_RATIO          = 0.4
const WEIGHT_EDGE_UNIFORM   = 0.2
const FALLBACK_FAIL_COUNT   = 50
// QC parameters (임시값 - 로그 수집 후 재조정 필요)
const QC_MIN_BRIGHTNESS     = 40
const QC_MAX_BRIGHTNESS     = 220
const QC_MIN_BLUR_VARIANCE  = 80  // ⚠️ 임시값

type DetectState = 'idle' | 'detecting' | 'stabilizing' | 'qc_fail_brightness' | 'qc_fail_blur' | 'qc_fail_angle'

interface CardCandidate {
  cx: number; cy: number; w: number; h: number; score: number
}

function sobelEdge(imageData: ImageData): Uint8ClampedArray {
  const { width, height, data } = imageData
  const gray = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  }
  const edge = new Uint8ClampedArray(width * height)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx = -gray[(y-1)*width+(x-1)] + gray[(y-1)*width+(x+1)] - 2*gray[y*width+(x-1)] + 2*gray[y*width+(x+1)] - gray[(y+1)*width+(x-1)] + gray[(y+1)*width+(x+1)]
      const gy = -gray[(y-1)*width+(x-1)] - 2*gray[(y-1)*width+x] - gray[(y-1)*width+(x+1)] + gray[(y+1)*width+(x-1)] + 2*gray[(y+1)*width+x] + gray[(y+1)*width+(x+1)]
      edge[y * width + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy))
    }
  }
  return edge
}

function binarize(edge: Uint8ClampedArray, threshold = 40): Uint8ClampedArray {
  const bin = new Uint8ClampedArray(edge.length)
  for (let i = 0; i < edge.length; i++) bin[i] = edge[i] > threshold ? 255 : 0
  return bin
}

function findEdgeRegions(bin: Uint8ClampedArray, width: number, height: number): Array<{ x: number; y: number; w: number; h: number }> {
  const visited = new Uint8ClampedArray(bin.length)
  const regions: Array<{ x: number; y: number; w: number; h: number }> = []
  for (let startY = 0; startY < height; startY++) {
    for (let startX = 0; startX < width; startX++) {
      const idx = startY * width + startX
      if (bin[idx] !== 255 || visited[idx]) continue
      const queue: number[] = [idx]
      visited[idx] = 1
      let minX = startX, maxX = startX, minY = startY, maxY = startY
      while (queue.length > 0) {
        const cur = queue.pop()!
        const cx = cur % width; const cy = Math.floor(cur / width)
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy
        for (const nb of [cur-1, cur+1, cur-width, cur+width]) {
          if (nb >= 0 && nb < bin.length && !visited[nb] && bin[nb] === 255) { visited[nb] = 1; queue.push(nb) }
        }
      }
      const w = maxX - minX; const h = maxY - minY
      if (w > 5 && h > 5) regions.push({ x: minX, y: minY, w, h })
    }
  }
  return regions
}

function edgeUniformityScore(bin: Uint8ClampedArray, width: number, x: number, y: number, w: number, h: number): number {
  const sc = 10; const scores: number[] = []
  let count = 0
  for (let i = 0; i < sc; i++) { const sx = x + Math.floor((w/sc)*i); if (sx < width && y < bin.length/width) count += bin[y*width+sx] > 0 ? 1 : 0 }
  scores.push(count/sc); count = 0
  for (let i = 0; i < sc; i++) { const sx = x + Math.floor((w/sc)*i); const by = y+h; if (sx < width && by < bin.length/width) count += bin[by*width+sx] > 0 ? 1 : 0 }
  scores.push(count/sc); count = 0
  for (let i = 0; i < sc; i++) { const sy = y + Math.floor((h/sc)*i); if (x < width && sy < bin.length/width) count += bin[sy*width+x] > 0 ? 1 : 0 }
  scores.push(count/sc); count = 0
  for (let i = 0; i < sc; i++) { const sy = y + Math.floor((h/sc)*i); const rx = x+w; if (rx < width && sy < bin.length/width) count += bin[sy*width+rx] > 0 ? 1 : 0 }
  scores.push(count/sc)
  const mean = scores.reduce((a,b) => a+b, 0) / scores.length
  const variance = scores.reduce((a,b) => a + Math.pow(b-mean, 2), 0) / scores.length
  return Math.max(0, 1 - Math.sqrt(variance) * 4)
}

function findBestCandidate(bin: Uint8ClampedArray, width: number, height: number): CardCandidate | null {
  const totalArea = width * height
  const regions = findEdgeRegions(bin, width, height)
  let best: CardCandidate | null = null; let bestScore = -1
  for (const r of regions) {
    const areaRatio = (r.w * r.h) / totalArea
    if (areaRatio < MIN_CARD_AREA_RATIO || areaRatio > MAX_CARD_AREA_RATIO) continue
    const ratioWH = r.w / r.h; const ratioHW = r.h / r.w
    const ratio = ratioWH < 1 ? ratioWH : ratioHW
    const ratioDiff = Math.abs(ratio - CARD_RATIO)
    if (ratioDiff > RATIO_TOLERANCE) continue
    const score = Math.min(areaRatio/MAX_CARD_AREA_RATIO,1)*WEIGHT_AREA + Math.max(0,1-ratioDiff/RATIO_TOLERANCE)*WEIGHT_RATIO + edgeUniformityScore(bin,width,r.x,r.y,r.w,r.h)*WEIGHT_EDGE_UNIFORM
    if (score > bestScore) { bestScore = score; best = { cx: r.x+r.w/2, cy: r.y+r.h/2, w: r.w, h: r.h, score } }
  }
  return best
}

// LT-SPEC-002 v1.3 QC-1: 밝기 체크
function calcBrightness(imageData: ImageData): number {
  const { data, width, height } = imageData
  let sum = 0
  const total = width * height
  for (let i = 0; i < total; i++) {
    sum += 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  }
  return sum / total
}

// LT-SPEC-002 v1.3 QC-2: 흐림 감지 (Laplacian Variance)
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
        gray[(y-1)*width+x] + gray[(y+1)*width+x] +
        gray[y*width+(x-1)] + gray[y*width+(x+1)] -
        4 * gray[y*width+x]
    }
  }
  const n = (width - 2) * (height - 2)
  const mean = lap.reduce((a, b) => a + b, 0) / n
  const variance = lap.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n
  return variance
}

function scaleToOriginal(val: number, processSize: number, originalSize: number): number {
  return val * (originalSize / processSize)
}

// LT-SPEC-003 LOCK: PNG 무손실 전송
async function cropROI(video: HTMLVideoElement, candidate: CardCandidate): Promise<string> {
  const origW = video.videoWidth; const origH = video.videoHeight
  const cx = scaleToOriginal(candidate.cx, PROCESS_WIDTH, origW)
  const cy = scaleToOriginal(candidate.cy, PROCESS_HEIGHT, origH)
  const cw = scaleToOriginal(candidate.w, PROCESS_WIDTH, origW)
  const ch = scaleToOriginal(candidate.h, PROCESS_HEIGHT, origH)
  const cropX = Math.max(0, cx-cw/2); const cropY = Math.max(0, cy-ch/2)
  const cropW = Math.min(cw, origW-cropX); const cropH = Math.min(ch, origH-cropY)
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = origW; tempCanvas.height = origH
  tempCanvas.getContext('2d')!.drawImage(video, 0, 0, origW, origH)
  const roiCanvas = document.createElement('canvas')
  roiCanvas.width = Math.round(cropW); roiCanvas.height = Math.round(cropH)
  roiCanvas.getContext('2d')!.drawImage(tempCanvas, Math.round(cropX), Math.round(cropY), Math.round(cropW), Math.round(cropH), 0, 0, Math.round(cropW), Math.round(cropH))
  return new Promise((resolve) => {
    roiCanvas.toBlob((blob) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(blob!)
    }, 'image/png')
  })
}

// LT-SPEC-003 LOCK: canvas → PNG base64
async function canvasToPngBase64(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(blob!)
    }, 'image/png')
  })
}

const CameraScreen = ({
  safeGoHome, runPipeline, BackArrow, sessionToken, nonce, dinaId, qrData,
  setCapturedImage, setConfidence, setMatchScore, setVerifyStatus, setRecordInfo,
  setErrorCode, setNetworkError, setProcessing, setScreen, cameraError, setCameraError,
}: CameraScreenProps) => {
  const { t } = useTranslation()
  const videoRef        = useRef<HTMLVideoElement>(null)
  const canvasRef       = useRef<HTMLCanvasElement>(null)
  const detectCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef       = useRef<MediaStream | null>(null)
  const detectLoopRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const stableCountRef  = useRef(0)
  const lastCandidateRef = useRef<CardCandidate | null>(null)
  const failCountRef    = useRef(0)

  const [cameraReady, setCameraReady]             = useState(false)
  const [permissionDenied, setPermissionDenied]   = useState(false)
  const [capturing, setCapturing]                 = useState(false)
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true)
  const [showGuideOverlay, setShowGuideOverlay]   = useState(false)
  const [detectState, setDetectState]             = useState<DetectState>('idle')
  const [stableProgress, setStableProgress]       = useState(0)
  const [guideBox, setGuideBox]                   = useState({ x: 0, y: 0, w: 280, h: 432, visible: false })

  // W4-2 LOCK: 보류된 미사용 props는 유지 (빅보스 명시 - 컴파일 통과 후 정리)
  // dinaId/sessionToken/nonce/qrData/setConfidence/setMatchScore/setRecordInfo/setErrorCode/runPipeline
  void sessionToken; void nonce; void dinaId; void qrData
  void setConfidence; void setMatchScore; void setRecordInfo; void setErrorCode; void runPipeline

  useEffect(() => { setShowGuideOverlay(true) }, [])

  const handleGuideConfirm = useCallback(() => { setShowGuideOverlay(false) }, [])
  const handleGuideReopen  = useCallback(() => setShowGuideOverlay(true), [])

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => { videoRef.current?.play(); setCameraReady(true); setCameraError(null) }
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') { setPermissionDenied(true); setCameraError(t('camera.permission')) }
        else setCameraError(t('camera.error'))
      }
    }
  }, [t, setCameraError])

  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraReady(false)
  }, [])

  const stopDetectLoop = useCallback(() => {
    if (detectLoopRef.current) { clearInterval(detectLoopRef.current); detectLoopRef.current = null }
  }, [])

  // [W4-1+W4-2 LOCK] CameraScreen = GeoCode 물리 검증 단독 책임
  // 메모리 #1 NeoSystem 3레이어 OFFICIAL LOCK 정합:
  //   ① GeoCode (물리) = 정품판단 = 이 화면 단독 책임
  //   ② DINA/QR (정체성) = ScanScreen 별도 처리
  //   ③ Event/Time (이력) = ScanResultScreen 별도 처리
  //
  // NeoStudio /geocam/detect-only 호출 (D4 정합: NeoStudio 프록시, 클라이언트 키 노출 X)
  // 응답 매핑 (D2 정합: 3-state 단일):
  //   pattern_result: PRESENT → setVerifyStatus('PRESENT')
  //   pattern_result: WEAK    → setVerifyStatus('INSUFFICIENT_DATA')  (W2 정합)
  //   pattern_result: ABSENT  → setVerifyStatus('ABSENT')
  //   기타/실패 → setVerifyStatus('INSUFFICIENT_DATA')
  const runModeB = useCallback(async (imageBase64: string) => {
    setProcessing(true)
    try {
      // W4-1 정정: NeoStudio /geocam/detect-only (D4 LOCK)
      //   기존: GeoStudio physical detect API + 클라이언트 API 키
      //   변경: NeoStudio /geocam/detect-only (헤더 키 제거, 프록시 강제)
      const res = await fetch(`${API_BASE_URL}/geocam/detect-only`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_data: imageBase64, profile: 'P-PAPER' })
      })
      if (!res.ok) {
        setNetworkError(true)
        setVerifyStatus('INSUFFICIENT_DATA')
        setScreen('result')
        setProcessing(false)
        return
      }
      const result = await res.json()
      const patternResult: string = result.pattern_result ?? ''

      // W4-1 정정: pattern_result → 3-state 매핑
      // W2 정합: WEAK → INSUFFICIENT_DATA (False Positive 방지)
      if (patternResult === 'PRESENT') {
        setVerifyStatus('PRESENT')
      } else if (patternResult === 'ABSENT') {
        setVerifyStatus('ABSENT')
      } else {
        // WEAK / 기타 / 빈 응답 → INSUFFICIENT_DATA
        setVerifyStatus('INSUFFICIENT_DATA')
      }
      // W4-1 정정: 이미지 유사도 점수 호출 제거 (D1: 이미지 유사도 검증 금지)
      setScreen('result')
    } catch (err) {
      setNetworkError(true)
      setVerifyStatus('INSUFFICIENT_DATA')
      setScreen('result')
    }
    setProcessing(false)
  }, [setProcessing, setNetworkError, setVerifyStatus, setScreen])

  // W4-2 정정: Mode A/C 분기 제거 → runModeB 단일 호출 (메모리 #1 정합)
  //   기존: if (sessionToken && nonce && dinaId) Mode A
  //         else if (!sessionToken && !nonce && !dinaId) Mode B
  //         else Mode C (runPipeline)
  //   변경: 무조건 runModeB (GeoCode 물리 검증 단독)
  const autoCapture = useCallback(async (candidate: CardCandidate) => {
    if (!videoRef.current || !canvasRef.current) return
    stopDetectLoop(); setCapturing(true); setDetectState('idle')
    const video = videoRef.current; const canvas = canvasRef.current
    const roiDataUrl = await cropROI(video, candidate)
    const roiBase64  = roiDataUrl.replace(/^data:image\/\w+;base64,/, '')
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const fullDataUrl = await canvasToPngBase64(canvas)
    setCapturedImage(fullDataUrl); stopCamera()
    // W4-2: GeoCode 물리 검증 단독 (Mode A/C 분기 제거)
    await runModeB(roiBase64)
    setCapturing(false)
  }, [stopDetectLoop, stopCamera, setCapturedImage, runModeB])

  const startDetectLoop = useCallback(() => {
    if (!autoDetectEnabled) return
    stopDetectLoop(); stableCountRef.current = 0; lastCandidateRef.current = null; failCountRef.current = 0
    detectLoopRef.current = setInterval(() => {
      const video = videoRef.current; const canvas = detectCanvasRef.current
      if (!video || !canvas || !cameraReady || capturing) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = PROCESS_WIDTH; canvas.height = PROCESS_HEIGHT
      ctx.drawImage(video, 0, 0, PROCESS_WIDTH, PROCESS_HEIGHT)
      const imageData = ctx.getImageData(0, 0, PROCESS_WIDTH, PROCESS_HEIGHT)
      const candidate = findBestCandidate(binarize(sobelEdge(imageData)), PROCESS_WIDTH, PROCESS_HEIGHT)

      if (!candidate) {
        stableCountRef.current = 0; lastCandidateRef.current = null; failCountRef.current++
        setDetectState('idle'); setStableProgress(0); setGuideBox(prev => ({ ...prev, visible: false }))
        if (failCountRef.current >= FALLBACK_FAIL_COUNT) { setAutoDetectEnabled(false); stopDetectLoop() }
        return
      }

      failCountRef.current = 0

      // LT-SPEC-002 v1.3 QC-1: 밝기 체크
      const brightness = calcBrightness(imageData)
      if (brightness < QC_MIN_BRIGHTNESS || brightness > QC_MAX_BRIGHTNESS) {
        console.log('[QC-1 FAIL] brightness=', brightness.toFixed(1))
        stableCountRef.current = 0
        setDetectState('qc_fail_brightness'); setStableProgress(0)
        lastCandidateRef.current = candidate
        return
      }

      // LT-SPEC-002 v1.3 QC-2: 흐림 감지
      const blurVariance = calcLaplacianVariance(imageData)
      if (blurVariance < QC_MIN_BLUR_VARIANCE) {
        console.log('[QC-2 FAIL] blur_variance=', blurVariance.toFixed(2))
        stableCountRef.current = 0
        setDetectState('qc_fail_blur'); setStableProgress(0)
        lastCandidateRef.current = candidate
        return
      }

      // LT-SPEC-002 v1.3 QC-3: 기울기 체크 (RATIO_TOLERANCE=0.08로 이미 강화됨)
      const ratioWH = candidate.w / candidate.h
      const ratioHW = candidate.h / candidate.w
      const ratio = ratioWH < 1 ? ratioWH : ratioHW
      const ratioDiff = Math.abs(ratio - CARD_RATIO)
      if (ratioDiff > RATIO_TOLERANCE) {
        console.log('[QC-3 FAIL] ratio_diff=', ratioDiff.toFixed(3))
        stableCountRef.current = 0
        setDetectState('qc_fail_angle'); setStableProgress(0)
        lastCandidateRef.current = candidate
        return
      }

      // QC 전부 통과 → 안정화 진행
      const scaleX = window.innerWidth / PROCESS_WIDTH
      const scaleY = (window.innerHeight * 0.75) / PROCESS_HEIGHT
      setGuideBox(prev => ({
        x: prev.x + (candidate.cx*scaleX - candidate.w*scaleX/2 - prev.x) * LERP_FACTOR,
        y: prev.y + (candidate.cy*scaleY - candidate.h*scaleY/2 - prev.y) * LERP_FACTOR,
        w: prev.w + (candidate.w*scaleX - prev.w) * LERP_FACTOR,
        h: prev.h + (candidate.h*scaleY - prev.h) * LERP_FACTOR,
        visible: true,
      }))

      const last = lastCandidateRef.current
      const moved = last ? Math.sqrt(Math.pow(candidate.cx-last.cx,2)+Math.pow(candidate.cy-last.cy,2)) : 999
      if (last && moved <= STABLE_POS_TOLERANCE && moved <= SPEED_THRESHOLD) {
        stableCountRef.current++; setStableProgress(stableCountRef.current); setDetectState('stabilizing')
      } else {
        stableCountRef.current = 0; setStableProgress(0); setDetectState('detecting')
      }
      lastCandidateRef.current = candidate
      if (stableCountRef.current >= STABLE_FRAMES) { stopDetectLoop(); autoCapture(candidate) }
    }, DETECT_INTERVAL_MS)
  }, [autoDetectEnabled, cameraReady, capturing, stopDetectLoop, autoCapture])

  useEffect(() => { startCamera(); return () => { stopCamera(); stopDetectLoop() } }, [startCamera, stopCamera, stopDetectLoop])
  useEffect(() => { if (cameraReady && autoDetectEnabled) startDetectLoop(); return () => stopDetectLoop() }, [cameraReady, autoDetectEnabled, startDetectLoop, stopDetectLoop])

  // W4-2 정정: Mode A/C 분기 제거 → runModeB 단일 호출 (메모리 #1 정합)
  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !cameraReady) return
    stopDetectLoop(); setCapturing(true)
    const video = videoRef.current; const canvas = canvasRef.current; const ctx = canvas.getContext('2d')
    if (!ctx) { setCapturing(false); return }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageDataUrl = await canvasToPngBase64(canvas)
    stopCamera(); setCapturedImage(imageDataUrl)
    const imageBase64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '')
    // W4-2: GeoCode 물리 검증 단독 (Mode A/C 분기 제거)
    await runModeB(imageBase64)
    setCapturing(false)
  }, [cameraReady, stopDetectLoop, stopCamera, setCapturedImage, runModeB])

  const handleBack = useCallback(() => { stopDetectLoop(); stopCamera(); safeGoHome() }, [stopDetectLoop, stopCamera, safeGoHome])

  const getBannerText = () => {
    switch (detectState) {
      case 'stabilizing':        return t('camera.guideDetecting')
      case 'detecting':          return t('camera.shootingGuideSummary')
      case 'qc_fail_brightness': return t('camera.qcBrightness') || '조명을 밝게 해주세요'
      case 'qc_fail_blur':       return t('camera.qcBlur') || '카드를 선명하게 맞춰주세요'
      case 'qc_fail_angle':      return t('camera.qcAngle') || '카드를 똑바로 놓아주세요'
      default:                   return t('camera.shootingGuideSummary')
    }
  }

  const getGuideColor = () => {
    if (detectState === 'stabilizing') return 'rgba(74,222,128,0.9)'
    if (detectState.startsWith('qc_fail')) return 'rgba(250,204,21,0.8)'
    return 'rgba(255,255,255,0.6)'
  }

  const getBannerStyle = () => {
    if (detectState === 'stabilizing') return { bg: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.35)', color: '#4ade80' }
    if (detectState.startsWith('qc_fail')) return { bg: 'rgba(250,204,21,0.10)', border: '1px solid rgba(250,204,21,0.35)', color: '#facc15' }
    return { bg: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }
  }

  const guideColor   = getGuideColor()
  const bannerText   = getBannerText()
  const bannerStyle  = getBannerStyle()

  const guides = [
    { icon: '▣', title: t('camera.shootingGuide1'), desc: t('camera.shootingGuide1Desc') },
    { icon: '◈', title: t('camera.shootingGuide2'), desc: t('camera.shootingGuide2Desc') },
    { icon: '◎', title: t('camera.shootingGuide3'), desc: t('camera.shootingGuide3Desc') },
    { icon: '☼', title: t('camera.shootingGuide4'), desc: t('camera.shootingGuide4Desc') },
  ]

  if (permissionDenied || cameraError) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: '#0a0a0c', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center' }}>
          <button onClick={handleBack} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><BackArrow /></button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
          </div>
          <p style={{ color: '#f87171', fontSize: '16px', fontWeight: '400', marginBottom: '8px', letterSpacing: '0.02em' }}>{t('camera.error')}</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', textAlign: 'center', maxWidth: '260px', lineHeight: '1.6', marginBottom: '28px' }}>{cameraError}</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleBack} style={{ padding: '12px 22px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: '14px', cursor: 'pointer' }}>{t('camera.home')}</button>
            <button onClick={startCamera} style={{ padding: '12px 22px', borderRadius: '10px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', color: '#4ade80', fontSize: '14px', cursor: 'pointer' }}>{t('common.retry')}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={handleBack} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><BackArrow /></button>
        <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '14px', fontWeight: '300', letterSpacing: '0.12em' }}>{t('capture.title')}</span>
        <button onClick={handleGuideReopen} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: '15px', fontWeight: '300' }}>?</button>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />

        {!cameraReady && !cameraError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)' }}>
            <div style={{ textAlign: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 48 48" fill="none" style={{ animation: 'spin 1s linear infinite', marginBottom: '14px' }}><circle cx="24" cy="24" r="22" stroke="rgba(255,255,255,0.15)" strokeWidth="2" /><path d="M24 2 A22 22 0 0 1 46 24" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" /></svg>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', letterSpacing: '0.05em' }}>{t('camera.loading')}</p>
            </div>
          </div>
        )}

        {cameraReady && (
          <div style={{ position: 'absolute', top: 'max(90px, calc(env(safe-area-inset-top) + 74px))', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 15, pointerEvents: 'none' }}>
            <div style={{ background: bannerStyle.bg, border: bannerStyle.border, borderRadius: '20px', padding: '5px 16px', transition: 'all 0.3s ease' }}>
              <p style={{ color: bannerStyle.color, fontSize: '12px', fontWeight: '300', letterSpacing: '0.04em', textAlign: 'center' }}>{bannerText}</p>
            </div>
          </div>
        )}

        {cameraReady && autoDetectEnabled && guideBox.visible && (
          <div style={{ position: 'absolute', left: `${guideBox.x}px`, top: `${guideBox.y}px`, width: `${guideBox.w}px`, height: `${guideBox.h}px`, pointerEvents: 'none', zIndex: 10 }}>
            {[
              { top: 0, left: 0, borderTop: `2px solid ${guideColor}`, borderLeft: `2px solid ${guideColor}`, borderTopLeftRadius: '8px' },
              { top: 0, right: 0, borderTop: `2px solid ${guideColor}`, borderRight: `2px solid ${guideColor}`, borderTopRightRadius: '8px' },
              { bottom: 0, left: 0, borderBottom: `2px solid ${guideColor}`, borderLeft: `2px solid ${guideColor}`, borderBottomLeftRadius: '8px' },
              { bottom: 0, right: 0, borderBottom: `2px solid ${guideColor}`, borderRight: `2px solid ${guideColor}`, borderBottomRightRadius: '8px' },
            ].map((s, i) => <div key={i} style={{ position: 'absolute', width: '36px', height: '36px', ...s }} />)}
            {detectState === 'stabilizing' && (
              <div style={{ position: 'absolute', bottom: '-28px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '4px' }}>
                {Array.from({ length: STABLE_FRAMES }).map((_, i) => (
                  <div key={i} style={{ width: '5px', height: '5px', borderRadius: '50%', background: i < stableProgress ? '#4ade80' : 'rgba(255,255,255,0.2)', transition: 'background 0.15s' }} />
                ))}
              </div>
            )}
          </div>
        )}

        {cameraReady && (!autoDetectEnabled || (autoDetectEnabled && !guideBox.visible)) && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: '240px', height: '370px', position: 'relative' }}>
              {[
                { top: 0, left: 0, borderTop: '2px solid rgba(255,255,255,0.5)', borderLeft: '2px solid rgba(255,255,255,0.5)', borderTopLeftRadius: '10px' },
                { top: 0, right: 0, borderTop: '2px solid rgba(255,255,255,0.5)', borderRight: '2px solid rgba(255,255,255,0.5)', borderTopRightRadius: '10px' },
                { bottom: 0, left: 0, borderBottom: '2px solid rgba(255,255,255,0.5)', borderLeft: '2px solid rgba(255,255,255,0.5)', borderBottomLeftRadius: '10px' },
                { bottom: 0, right: 0, borderBottom: '2px solid rgba(255,255,255,0.5)', borderRight: '2px solid rgba(255,255,255,0.5)', borderBottomRightRadius: '10px' },
              ].map((s, i) => <div key={i} style={{ position: 'absolute', width: '44px', height: '44px', ...s }} />)}
            </div>
          </div>
        )}

        {cameraReady && !autoDetectEnabled && (
          <div style={{ position: 'absolute', top: '130px', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 15, pointerEvents: 'none' }}>
            <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '10px', padding: '6px 14px' }}>
              <p style={{ color: '#f87171', fontSize: '11px', letterSpacing: '0.03em', textAlign: 'center' }}>{t('camera.manualMode')}</p>
            </div>
          </div>
        )}

        {showGuideOverlay && (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', zIndex: 30, padding: '0' }}>
            <div style={{ width: '100%', maxWidth: '480px', padding: '32px 24px', paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', letterSpacing: '0.2em', fontWeight: '300', marginBottom: '6px', textAlign: 'center' }}>BEFORE YOU SHOOT</p>
              <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '20px', fontWeight: '200', letterSpacing: '0.04em', marginBottom: '24px', textAlign: 'center' }}>
                {t('camera.shootingGuideTitle')}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                {guides.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '12px 16px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>{String(i + 1).padStart(2, '0')}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '14px', fontWeight: '400', marginBottom: '2px', letterSpacing: '0.01em' }}>{item.title}</p>
                      <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px', lineHeight: '1.5', fontWeight: '300' }}>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={handleGuideConfirm}
                style={{ width: '100%', padding: '15px', borderRadius: '14px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.9)', fontSize: '15px', fontWeight: '300', letterSpacing: '0.06em', cursor: 'pointer' }}
              >
                {t('camera.shootingGuideConfirm')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '24px', paddingBottom: 'max(40px, env(safe-area-inset-bottom))', background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', marginBottom: '16px', textAlign: 'center', letterSpacing: '0.05em' }}>
          {autoDetectEnabled ? t('camera.autoActive') : t('capture.title')}
        </p>
        <button onClick={capturePhoto} disabled={!cameraReady || capturing} style={{ width: '72px', height: '72px', borderRadius: '50%', background: cameraReady ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.2)', border: '3px solid rgba(255,255,255,0.2)', cursor: cameraReady ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.1s' }}>
          {capturing
            ? <svg width="28" height="28" viewBox="0 0 32 32" fill="none" style={{ animation: 'spin 1s linear infinite' }}><circle cx="16" cy="16" r="14" stroke="#0a0a0c" strokeWidth="2" strokeDasharray="8 4" /></svg>
            : <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: cameraReady ? '#0a0a0c' : 'rgba(0,0,0,0.2)' }} />
          }
        </button>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <canvas ref={detectCanvasRef} style={{ display: 'none' }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default CameraScreen
