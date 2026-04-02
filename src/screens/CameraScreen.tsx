import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { API_BASE_URL } from '../api/client'
import type { CameraScreenProps } from '../types/app.types'

const GEOSTUDIO_API_URL = 'https://geo-api.artionchain.com'
const INTERNAL_API_KEY = 'geo-artion-2026-prod'

const CameraScreen = ({
  safeGoHome,
  runPipeline,
  BackArrow,
  sessionToken,
  nonce,
  dinaId,
  qrData,
  setCapturedImage,
  setConfidence,
  setMatchScore,
  setVerifyStatus,
  setRecordInfo,
  setErrorCode,
  setNetworkError,
  setProcessing,
  setScreen,
  cameraError,
  setCameraError,
}: CameraScreenProps) => {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [showGuideOverlay, setShowGuideOverlay] = useState(true)

  useEffect(() => {
    if (cameraReady && showGuideOverlay) {
      const timer = setTimeout(() => {
        setShowGuideOverlay(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [cameraReady, showGuideOverlay])

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play()
          setCameraReady(true)
          setCameraError(null)
        }
      }
    } catch (err) {
      console.error('Camera error:', err)
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
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraReady(false)
  }, [])

  useEffect(() => {
    startCamera()
    return () => { stopCamera() }
  }, [startCamera, stopCamera])

  // Mode B: Track A 2축 붕괴 측정 엔진 (detect-physical)
  // 검출기는 패턴을 찾지 않는다. 붕괴를 측정한다.
  const runModeB = useCallback(async (imageBase64: string) => {
    setProcessing(true)
    try {
      const detectResponse = await fetch(`${GEOSTUDIO_API_URL}/api/geocode/detect-physical`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': INTERNAL_API_KEY,
        },
        body: JSON.stringify({
          image_data: imageBase64,
          profile: 'P-PAPER',
        })
      })

      if (!detectResponse.ok) {
        console.error('[ModeB] GeoStudio error:', detectResponse.status)
        setNetworkError(true)
        setVerifyStatus('ABSENT')
        setScreen('result')
        setProcessing(false)
        return
      }

      const detectResult = await detectResponse.json()

      console.log('[ModeB detect-physical]',
        `band2_collapse=${detectResult.band2_collapse_rate}%`,
        `ratio_change=${detectResult.ratio_change_rate}%`,
        `verdict=${detectResult.verdict}`,
        `axis1=${detectResult.axis1_triggered}`,
        `axis2=${detectResult.axis2_triggered}`,
      )

      const verdict: string = detectResult.verdict ?? 'ABSENT'

      if (verdict === 'PRESENT') {
        setVerifyStatus('PRESENT')
      } else if (verdict === 'WEAK') {
        setVerifyStatus('WEAK')
      } else {
        setVerifyStatus('ABSENT')
      }

      // band2_collapse_rate를 match_score로 전달 (UI 참고용)
      const score = detectResult.band2_collapse_rate != null
        ? Math.max(0, Math.round((1 - detectResult.band2_collapse_rate / 100) * 100) / 100)
        : null
      if (score !== null) {
        setMatchScore(score)
      }

      setScreen('result')
    } catch (err) {
      console.error('[ModeB] network error:', err)
      setNetworkError(true)
      setVerifyStatus('ABSENT')
      setScreen('result')
    }
    setProcessing(false)
  }, [setProcessing, setNetworkError, setVerifyStatus, setMatchScore, setScreen])

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !cameraReady) return

    setCapturing(true)

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    if (!ctx) { setCapturing(false); return }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9)

    stopCamera()
    setCapturedImage(imageDataUrl)

    const imageBase64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '')

    if (sessionToken && nonce && dinaId) {
      // Mode A: QR-linked full verify flow
      setProcessing(true)
      try {
        let patternResult: string | null = null
        try {
          const detectResponse = await fetch(`${API_BASE_URL}/geocam/detect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dina_id: dinaId, image_data: imageBase64, session_token: sessionToken, profile: 'P-PAPER' })
          })
          if (detectResponse.ok) {
            const detectResult = await detectResponse.json()
            patternResult = detectResult.pattern_result || null
          }
        } catch (detectErr) {
          console.warn('[ModeA detect] network error:', detectErr)
        }

        const verifyResponse = await fetch(`${API_BASE_URL}/geocam/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_token: sessionToken,
            session_id: sessionToken,
            dina_id: dinaId,
            nonce: nonce,
            signature: 'camera-capture',
            device_info: {
              platform: navigator.platform || 'web',
              model: 'WebCamera',
              os_version: navigator.userAgent.substring(0, 50),
              fingerprint: navigator.userAgent.substring(0, 32),
            },
            client_timestamp: Date.now(),
          })
        })

        const result = await verifyResponse.json()
        console.log('[ModeA verify] response:', result, 'pattern:', patternResult)

        if (result.success) {
          setConfidence(result.confidence)
          setMatchScore(result.match_score || null)
          setVerifyStatus(result.result)
          setRecordInfo({ recordId: crypto.randomUUID(), packHash: 'verify-' + Date.now(), createdAt: new Date().toISOString() })
        } else {
          setErrorCode(result.error)
          setVerifyStatus(result.result || 'UNKNOWN')
        }
        setScreen('result')
      } catch (err) {
        console.error('[ModeA] pipeline error:', err)
        setNetworkError(true)
        setVerifyStatus('UNKNOWN')
        setScreen('result')
      }
      setProcessing(false)
    } else if (!sessionToken && !nonce && !dinaId) {
      // Mode B: Track A 2축 붕괴 측정
      await runModeB(imageBase64)
    } else {
      // fallback: legacy pipeline
      runPipeline(qrData, imageDataUrl)
    }

    setCapturing(false)
  }, [cameraReady, stopCamera, sessionToken, nonce, dinaId, qrData, setCapturedImage, setProcessing, setConfidence, setMatchScore, setVerifyStatus, setRecordInfo, setErrorCode, setNetworkError, setScreen, runPipeline, runModeB])

  const handleBack = useCallback(() => {
    stopCamera()
    safeGoHome()
  }, [stopCamera, safeGoHome])

  if (permissionDenied || cameraError) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: '#0a0a0c', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center' }}>
          <button onClick={handleBack} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <BackArrow />
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(248,113,113,0.1)', border: '2px solid rgba(248,113,113,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.5">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </div>
          <p style={{ color: '#f87171', fontSize: '18px', fontWeight: '500', marginBottom: '12px' }}>{t('camera.error')}</p>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', textAlign: 'center', maxWidth: '280px', lineHeight: '1.5', marginBottom: '32px' }}>{cameraError}</p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={handleBack} style={{ padding: '14px 24px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '15px', cursor: 'pointer' }}>{t('camera.home')}</button>
            <button onClick={startCamera} style={{ padding: '14px 24px', borderRadius: '12px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: '15px', cursor: 'pointer' }}>{t('common.retry')}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={handleBack} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <BackArrow />
        </button>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', letterSpacing: '0.1em' }}>{t('capture.title')}</span>
        <div style={{ width: '40px' }} />
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />

        {!cameraReady && !cameraError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)' }}>
            <div style={{ textAlign: 'center' }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }}>
                <circle cx="24" cy="24" r="22" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" />
                <path d="M24 2 A22 22 0 0 1 46 24" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>{t('camera.loading')}...</p>
            </div>
          </div>
        )}

        {cameraReady && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: '280px', height: '280px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: '50px', height: '50px', borderTop: '3px solid rgba(255,255,255,0.6)', borderLeft: '3px solid rgba(255,255,255,0.6)', borderTopLeftRadius: '12px' }} />
              <div style={{ position: 'absolute', top: 0, right: 0, width: '50px', height: '50px', borderTop: '3px solid rgba(255,255,255,0.6)', borderRight: '3px solid rgba(255,255,255,0.6)', borderTopRightRadius: '12px' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, width: '50px', height: '50px', borderBottom: '3px solid rgba(255,255,255,0.6)', borderLeft: '3px solid rgba(255,255,255,0.6)', borderBottomLeftRadius: '12px' }} />
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: '50px', height: '50px', borderBottom: '3px solid rgba(255,255,255,0.6)', borderRight: '3px solid rgba(255,255,255,0.6)', borderBottomRightRadius: '12px' }} />
            </div>
          </div>
        )}

        {cameraReady && showGuideOverlay && (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, animation: 'fadeOut 0.5s ease-out 2.5s forwards', pointerEvents: 'none' }}>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: '16px', fontWeight: '500', textAlign: 'center', marginBottom: '12px', padding: '0 24px', lineHeight: '1.5' }}>
              {t('camera.guideTitle')}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: '400', textAlign: 'center' }}>
              {t('camera.guideTip')}
            </p>
          </div>
        )}
      </div>

      <div style={{ padding: '24px', paddingBottom: 'max(40px, env(safe-area-inset-bottom))', background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', marginBottom: '20px', textAlign: 'center' }}>
          {t('capture.title')}
        </p>
        <button
          onClick={capturePhoto}
          disabled={!cameraReady || capturing}
          style={{ width: '72px', height: '72px', borderRadius: '50%', background: cameraReady ? 'white' : 'rgba(255,255,255,0.3)', border: '4px solid rgba(255,255,255,0.3)', cursor: cameraReady ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.1s' }}
        >
          {capturing ? (
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx="16" cy="16" r="14" stroke="#0a0a0c" strokeWidth="2" strokeDasharray="8 4" />
            </svg>
          ) : (
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: cameraReady ? '#0a0a0c' : 'rgba(0,0,0,0.3)' }} />
          )}
        </button>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; visibility: hidden; } }
      `}</style>
    </div>
  )
}

export default CameraScreen
