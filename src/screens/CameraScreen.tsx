import { useState, useRef, useCallback, useEffect } from 'react'
import { API_BASE_URL } from '../api/client'
import type { CameraScreenProps } from '../types/app.types'

const CameraScreen = ({
  safeGoHome,
  runPipeline,
  BackArrow,
  t,
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
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [showGuideOverlay, setShowGuideOverlay] = useState(true)

  // 가이드 오버레이 3초 후 자동 fade out
  useEffect(() => {
    if (cameraReady && showGuideOverlay) {
      const timer = setTimeout(() => {
        setShowGuideOverlay(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [cameraReady, showGuideOverlay])

  // 카메라 시작
  const startCamera = useCallback(async () => {
    try {
      // 기존 스트림 정리
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
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
        } else if (err.name === 'NotFoundError') {
          setCameraError(t('camera.error'))
        } else if (err.name === 'NotReadableError') {
          setCameraError(t('camera.error'))
        } else {
          setCameraError(t('camera.error'))
        }
      }
    }
  }, [t, setCameraError])

  // 카메라 정지
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop()
      })
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraReady(false)
  }, [])

  // 마운트 시 카메라 시작, 언마운트 시 정지
  useEffect(() => {
    startCamera()
    return () => {
      stopCamera()
    }
  }, [startCamera, stopCamera])

  // 사진 촬영
  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !cameraReady) return

    setCapturing(true)

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      setCapturing(false)
      return
    }

    // 비디오 크기에 맞춰 캔버스 설정
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // 비디오 프레임을 캔버스에 그리기
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // 캔버스를 이미지 데이터로 변환
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9)

    // 카메라 정지
    stopCamera()

    // 상태 업데이트
    setCapturedImage(imageDataUrl)

    // QR 스캔에서 왔고 세션 정보가 있으면 직접 verify API 호출
    if (sessionToken && nonce && dinaId) {
      setProcessing(true)
      try {
        // Base64 데이터만 추출 (data:image/jpeg;base64, 제거)
        const imageBase64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '')

        // verify API 호출
        const response = await fetch(`${API_BASE_URL}/geocam/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_token: sessionToken,
            nonce: nonce,
            image_data: imageBase64,
            device_info: {
              platform: navigator.platform || 'web',
              model: 'WebCamera',
              os_version: navigator.userAgent.substring(0, 50)
            },
            client_timestamp: Date.now()
          })
        })

        const result = await response.json()
        console.log('[verify] response:', result)

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
        console.error('verify error:', err)
        setNetworkError(true)
        setVerifyStatus('UNKNOWN')
        setScreen('result')
      }
      setProcessing(false)
    } else {
      // 세션 정보 없으면 기존 파이프라인 실행 (QR 없이 이미지만)
      runPipeline(qrData, imageDataUrl)
    }

    setCapturing(false)
  }, [cameraReady, stopCamera, sessionToken, nonce, dinaId, qrData, setCapturedImage, setProcessing, setConfidence, setMatchScore, setVerifyStatus, setRecordInfo, setErrorCode, setNetworkError, setScreen, runPipeline])

  // 뒤로 가기
  const handleBack = useCallback(() => {
    stopCamera()
    safeGoHome()
  }, [stopCamera, safeGoHome])

  // 권한 거부 화면
  if (permissionDenied || cameraError) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: '#0a0a0c', display: 'flex', flexDirection: 'column' }}>
        {/* 헤더 */}
        <div style={{ padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center' }}>
          <button onClick={handleBack} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <BackArrow />
          </button>
        </div>

        {/* 에러 메시지 */}
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
      {/* 헤더 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={handleBack} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <BackArrow />
        </button>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', letterSpacing: '0.1em' }}>{t('capture.title')}</span>
        <div style={{ width: '40px' }} />
      </div>

      {/* 카메라 프리뷰 */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />

        {/* 로딩 표시 */}
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

        {/* 촬영 가이드 프레임 */}
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

        {/* 초기 가이드 오버레이 (3초 후 fade out) */}
        {cameraReady && showGuideOverlay && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              animation: 'fadeOut 0.5s ease-out 2.5s forwards',
              pointerEvents: 'none',
            }}
          >
            <p style={{
              color: 'rgba(255,255,255,0.95)',
              fontSize: '16px',
              fontWeight: '500',
              textAlign: 'center',
              marginBottom: '12px',
              padding: '0 24px',
              lineHeight: '1.5',
            }}>
              {t('camera.guideTitle')}
            </p>
            <p style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: '13px',
              fontWeight: '400',
              textAlign: 'center',
            }}>
              {t('camera.guideTip')}
            </p>
          </div>
        )}
      </div>

      {/* 하단 컨트롤 */}
      <div style={{ padding: '24px', paddingBottom: 'max(40px, env(safe-area-inset-bottom))', background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', marginBottom: '20px', textAlign: 'center' }}>
          {t('capture.title')}
        </p>

        {/* 셔터 버튼 */}
        <button
          onClick={capturePhoto}
          disabled={!cameraReady || capturing}
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: cameraReady ? 'white' : 'rgba(255,255,255,0.3)',
            border: '4px solid rgba(255,255,255,0.3)',
            cursor: cameraReady ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.1s',
          }}
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

      {/* 캡처용 숨겨진 캔버스 */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* 애니메이션 */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; visibility: hidden; }
        }
      `}</style>
    </div>
  )
}

export default CameraScreen
