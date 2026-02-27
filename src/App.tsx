import './i18n';
import { useTranslation } from 'react-i18next';
import { useState, useRef, useCallback, useEffect, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { runEvidencePipeline, registerWithServer } from './evidencePipeline'
import { API_BASE_URL } from './api/client'
import './App.css'

// Error Boundary for debugging blank screen issues
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0a0a0c',
          color: 'white',
          padding: '20px',
          paddingTop: '60px',
          fontFamily: 'monospace'
        }}>
          <h1 style={{ color: '#f87171', fontSize: '24px', marginBottom: '20px' }}>
            앱 오류 발생
          </h1>
          <div style={{
            background: 'rgba(248,113,113,0.1)',
            border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px'
          }}>
            <p style={{ color: '#f87171', fontSize: '14px', marginBottom: '8px', fontWeight: 'bold' }}>
              Error:
            </p>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '12px', wordBreak: 'break-all' }}>
              {this.state.error?.message || 'Unknown error'}
            </p>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px',
            maxHeight: '300px',
            overflow: 'auto'
          }}>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginBottom: '8px' }}>
              Stack Trace:
            </p>
            <pre style={{
              color: 'rgba(255,255,255,0.7)',
              fontSize: '10px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0
            }}>
              {this.state.error?.stack || 'No stack trace'}
            </pre>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            padding: '16px',
            maxHeight: '200px',
            overflow: 'auto'
          }}>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginBottom: '8px' }}>
              Component Stack:
            </p>
            <pre style={{
              color: 'rgba(255,255,255,0.7)',
              fontSize: '10px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0
            }}>
              {this.state.errorInfo?.componentStack || 'No component stack'}
            </pre>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '14px 28px',
              borderRadius: '12px',
              background: 'rgba(74,222,128,0.1)',
              border: '1px solid rgba(74,222,128,0.3)',
              color: '#4ade80',
              fontSize: '14px',
              cursor: 'pointer',
              width: '100%'
            }}
          >
            앱 새로고침
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

type Screen = 'home' | 'camera' | 'scan' | 'scanResult' | 'result' | 'records' | 'gallery' | 'preview' | 'settings' | 'otpInput' | 'registerResult'
type ScanMode = 'camera' | 'scan'
type ScanStatus = 'PENDING' | 'CLAIMED' | 'ALREADY_CLAIMED' | 'EXPIRED' | 'ERROR'

interface RecordInfo {
  recordId: string;
  packHash: string;
  createdAt: string;
}

interface ScanResultInfo {
  status: ScanStatus;
  pendingId?: string;
  message?: string;
}

function App() {
  const { t, i18n } = useTranslation();
  const [screen, setScreen] = useState<Screen>('home')
  const [scanMode, setScanMode] = useState<ScanMode>('camera')
  const [, setQrDetected] = useState(false)
  const [qrData, setQrData] = useState<string | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [previewImage, _setPreviewImage] = useState<string>('')
  const [recordInfo, setRecordInfo] = useState<RecordInfo | null>(null)
  const [scanResultInfo, setScanResultInfo] = useState<ScanResultInfo | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<'VALID' | 'SUSPECT' | 'UNKNOWN' | 'INVALID' | null>(null)
  const [processing, setProcessing] = useState(false)
  const [, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [networkError, setNetworkError] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [nonce, setNonce] = useState<string | null>(null)
  const [dinaId, setDinaId] = useState<string | null>(null)
  const [signatureVerified, setSignatureVerified] = useState<boolean | null>(null)
  const [confidence, setConfidence] = useState<number | null>(null)
  const [matchScore, setMatchScore] = useState<number | null>(null)
  const [registering, setRegistering] = useState(false)
  const [registerStatus, setRegisterStatus] = useState<string | null>(null)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [otpInput, setOtpInput] = useState('')

  const getDeviceFingerprint = (): string => {
    const nav = navigator;
    const raw = `${nav.userAgent}-${nav.language}-${window.screen.width}x${window.screen.height}`;
    return btoa(raw).slice(0, 32);
  }

  const BackArrow = () => (
    <svg style={{ width: '20px', height: '20px', color: 'rgba(255,255,255,0.8)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  )

  const safeGoHome = useCallback(() => {
    try {
      setQrDetected(false); setQrData(null); setCapturedImage(null); setRecordInfo(null);
      setError(null); setErrorCode(null); setProcessing(false); setNetworkError(false); setScanResultInfo(null);
      setVerifyStatus(null); setCameraError(null);
      setSessionToken(null); setNonce(null); setDinaId(null); setSignatureVerified(null); setConfidence(null); setMatchScore(null);
      setRegistering(false); setRegisterStatus(null); setRegisterError(null); setOtpInput('');
      setScreen('home');
    } catch (e) { console.error('error:', e); setScreen('home'); }
  }, []);

  const safeGoCamera = useCallback(() => {
    try {
      setScanMode('camera'); setQrDetected(false); setQrData(null); setCapturedImage(null);
      setRecordInfo(null); setError(null); setErrorCode(null); setProcessing(false); setNetworkError(false);
      setVerifyStatus(null); setCameraError(null); setScreen('camera');
    } catch (e) { console.error('error:', e); setScreen('camera'); }
  }, []);

  const safeGoScan = useCallback(() => {
    try {
      setScanMode('scan'); setQrDetected(false); setQrData(null); setCapturedImage(null);
      setRecordInfo(null); setError(null); setProcessing(false); setNetworkError(false);
      setScanResultInfo(null); setScreen('scan');
    } catch (e) { console.error('error:', e); setScreen('scan'); }
  }, []);

  // 갤러리 버튼 - @capacitor/camera로 갤러리 열기
  const openGalleryPicker = useCallback(async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos
      })

      if (image.dataUrl) {
        setQrDetected(false); setQrData(null); setCapturedImage(null);
        setRecordInfo(null); setError(null); setProcessing(false);
        setNetworkError(false); setVerifyStatus(null); setCameraError(null);

        setCapturedImage(image.dataUrl)
        setScanMode('scan')
        runPipeline(null, image.dataUrl)
      }
    } catch (e: any) {
      // 취소 시 무시
      if (e?.message?.includes('cancel') || e?.message?.includes('Cancel')) return
    }
  }, []);

  const runPipeline = async (qrRaw: string | null, imageUri: string) => {
    setProcessing(true); setError(null); setErrorCode(null); setNetworkError(false); setMatchScore(null);
    try {
      const result = await runEvidencePipeline({ qrRaw, imageUri, geoBucket: null, deviceFingerprintHash: getDeviceFingerprint() });
      if (result.error_code) setErrorCode(result.error_code);
      if (result.sessionToken) setSessionToken(result.sessionToken);
      if (result.nonce) setNonce(result.nonce);
      if (result.dinaId) setDinaId(result.dinaId);
      if (result.signatureVerified !== undefined) setSignatureVerified(result.signatureVerified);
      if (result.confidence !== undefined && result.confidence !== null) setConfidence(result.confidence);
      if (result.match_score !== undefined && result.match_score !== null) setMatchScore(result.match_score);
      if (result.ok && result.recordId && result.packHash) {
        setRecordInfo({ recordId: result.recordId, packHash: result.packHash, createdAt: new Date().toISOString() });
        setVerifyStatus(result.verify_status || 'VALID');
        setScreen('result');
      } else {
        setError(result.error || 'UNKNOWN_ERROR');
        setVerifyStatus(result.verify_status || 'UNKNOWN');
        setScreen('result');
      }
    } catch (err) {
      if (err instanceof Error && (err.message.includes('fetch') || err.message.includes('network'))) {
        setNetworkError(true);
      }
      setError(err instanceof Error ? err.message : 'PIPELINE_ERROR');
      setVerifyStatus('UNKNOWN');
      setScreen('result');
    }
    finally { setProcessing(false); }
  }

  const HomeScreen = () => (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 32px', backgroundColor: '#0a0a0c' }}>
      <div style={{ paddingTop: '120px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: '200', letterSpacing: '0.25em', marginBottom: '8px', color: 'rgba(255,255,255,0.9)' }}>Geo Cam</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', letterSpacing: '0.2em' }}>{t('home.subtitle')}</p>
      </div>
      <div style={{ marginTop: '100px', width: '260px', position: 'relative', zIndex: 10 }}>
        <button onClick={safeGoCamera} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', fontWeight: '300', letterSpacing: '0.1em', cursor: 'pointer' }}>Camera</button>
        <div style={{ height: '50px' }} />
        <button onClick={safeGoScan} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', fontWeight: '300', letterSpacing: '0.1em', cursor: 'pointer' }}>Scan</button>
        <div style={{ height: '30px' }} />
        <button onClick={openGalleryPicker} style={{ position: 'relative', zIndex: 9999, width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', fontWeight: '300', letterSpacing: '0.1em', fontSize: '15px', cursor: 'pointer' }}>Gallery</button>
      </div>
      <div style={{ position: 'absolute', bottom: 'max(40px, env(safe-area-inset-bottom))', textAlign: 'center', left: 0, right: 0, zIndex: 1, pointerEvents: 'none' }}>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', letterSpacing: '0.2em', pointerEvents: 'none' }}>Powered by Artion</p>
      </div>
    </div>
  )

  // CameraScreen - 실물 촬영 (QR 스캔 없음)
  const CameraScreen = () => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const [cameraReady, setCameraReady] = useState(false)
    const [permissionDenied, setPermissionDenied] = useState(false)
    const [capturing, setCapturing] = useState(false)

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
    }, [])

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
        setScanMode('camera')
        runPipeline(qrData, imageDataUrl)
      }

      setCapturing(false)
    }, [cameraReady, stopCamera, sessionToken, nonce, dinaId, qrData])

    // 뒤로 가기
    const handleBack = useCallback(() => {
      stopCamera()
      safeGoHome()
    }, [stopCamera])

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

        {/* 스핀 애니메이션 */}
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  // ScanScreen - QR 스캔 후 scan/start API 호출 → 카메라 화면으로 전환
  const ScanScreen = () => {
    const [localProcessing, setLocalProcessing] = useState(false)
    const [scanError, setScanError] = useState<string | null>(null)
    const scanLockRef = useRef(false)

    // scan/start API 호출 후 카메라 화면으로 전환
    const startScanSession = async (dinaCode: string) => {
      setProcessing(true)
      setNetworkError(false)
      setErrorCode(null)
      setDinaId(dinaCode)

      try {
        const response = await fetch(`${API_BASE_URL}/geocam/scan/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            qr_payload: dinaCode,
            device_id: getDeviceFingerprint(),
            app_version: '2.0.0'
          })
        })

        if (!response.ok) {
          if (response.status >= 500) {
            setNetworkError(true)
            setScanResultInfo({ status: 'ERROR', message: t('error.server') })
          } else if (response.status === 429) {
            setErrorCode('RATE_LIMIT_EXCEEDED')
            setScanResultInfo({ status: 'ERROR', message: t('error.rateLimit') })
          } else {
            setScanResultInfo({ status: 'ERROR', message: t('error.network') })
          }
          setProcessing(false)
          setScreen('scanResult')
          return
        }

        const result = await response.json()

        if (!result.success) {
          const errorCode = result.error
          if (errorCode === 'BATCH_NOT_SHIPPED') {
            setErrorCode('BATCH_NOT_SHIPPED')
            setScanResultInfo({ status: 'ERROR', message: t('error.batch') })
          } else if (errorCode === 'INVALID_QR') {
            setScanResultInfo({ status: 'ERROR', message: t('scan.invalid') })
          } else {
            setScanResultInfo({ status: 'ERROR', message: result.error || t('error.server') })
          }
          setProcessing(false)
          setScreen('scanResult')
          return
        }

        // 세션 정보 저장
        setSessionToken(result.session_token)
        setNonce(result.nonce)
        if (result.asset_info?.dina_id) setDinaId(result.asset_info.dina_id)
        setProcessing(false)

        // 카메라 화면으로 전환 (실물 촬영)
        setScanMode('scan')  // scan 모드에서 왔음을 표시
        setScreen('camera')

      } catch (err) {
        console.error('scan/start error:', err)
        setNetworkError(true)
        setScanResultInfo({ status: 'ERROR', message: t('error.network') })
        setProcessing(false)
        setScreen('scanResult')
      }
    }

    // QR 스캔 성공 시 처리
    const handleQrDetected = useCallback(async (result: any) => {
      // 중복 스캔 방지 (useRef + localProcessing 이중 가드)
      if (scanLockRef.current || localProcessing) return

      if (result && result[0]?.rawValue) {
        const data = result[0].rawValue
        if (data.includes('DINA-') || /^[A-Z0-9]{8,16}$/.test(data.trim())) {
          // 스캔 락 설정
          scanLockRef.current = true
          setLocalProcessing(true)
          setQrData(data)
          setQrDetected(true)

          // DINA 코드 추출
          const dinaMatch = data.match(/DINA-[A-Z0-9]{8,16}/)
          const dinaCode = dinaMatch ? dinaMatch[0] : (/^[A-Z0-9]{8,16}$/.test(data.trim()) ? data.trim() : null)

          if (dinaCode) {
            await startScanSession(dinaCode)
          } else {
            setScanError(t('scan.invalid'))
            setTimeout(() => setScanError(null), 2000)
            scanLockRef.current = false
            setLocalProcessing(false)
          }
        } else {
          setScanError(t('scan.invalid'))
          setTimeout(() => setScanError(null), 2000)
        }
      }
    }, [localProcessing])

    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', display: 'flex', flexDirection: 'column' }}>
        {/* 헤더 */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={safeGoHome} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <BackArrow />
          </button>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', letterSpacing: '0.1em' }}>{t('camera.title')}</span>
          <div style={{ width: '40px' }} />
        </div>

        {/* 카메라 영역 - Scanner 사용 */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div id="scan-scanner" style={{ position: 'absolute', inset: 0 }}>
            <Scanner
              onScan={handleQrDetected}
              constraints={{ facingMode: 'environment' }}
              styles={{
                container: { width: '100%', height: '100%' },
                video: { width: '100%', height: '100%', objectFit: 'cover' }
              }}
              onError={(err) => {
                console.error('Scanner error:', err)
                setCameraError(t('camera.error'))
              }}
            />
          </div>

          {/* 카메라 에러 표시 */}
          {cameraError && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: '#0a0a0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
              <p style={{ color: '#f87171', fontSize: '16px', marginBottom: '12px' }}>{t('camera.error')}</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', textAlign: 'center', marginBottom: '24px' }}>{cameraError}</p>
              <button onClick={safeGoHome} style={{ padding: '12px 24px', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer' }}>{t('common.home')}</button>
            </div>
          )}

          {/* 스캔 영역 가이드 */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '240px', height: '240px', zIndex: 10, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '50px', height: '50px', borderTop: '4px solid #4ade80', borderLeft: '4px solid #4ade80', borderTopLeftRadius: '16px' }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: '50px', height: '50px', borderTop: '4px solid #4ade80', borderRight: '4px solid #4ade80', borderTopRightRadius: '16px' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '50px', height: '50px', borderBottom: '4px solid #4ade80', borderLeft: '4px solid #4ade80', borderBottomLeftRadius: '16px' }} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: '50px', height: '50px', borderBottom: '4px solid #4ade80', borderRight: '4px solid #4ade80', borderBottomRightRadius: '16px' }} />
          </div>

          {/* 에러 메시지 */}
          {scanError && (
            <div style={{ position: 'absolute', top: '25%', left: '50%', transform: 'translateX(-50%)', padding: '12px 24px', background: 'rgba(248,113,113,0.9)', borderRadius: '12px', zIndex: 30 }}>
              <p style={{ color: 'white', fontSize: '14px', margin: 0 }}>{scanError}</p>
            </div>
          )}

          {/* 처리 중 표시 */}
          {localProcessing && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '16px 32px', background: 'rgba(0,0,0,0.8)', borderRadius: '12px', zIndex: 20 }}>
              <p style={{ color: '#4ade80', fontSize: '16px', margin: 0 }}>{t('scan.processing')}...</p>
            </div>
          )}
        </div>

        {/* 하단 안내 */}
        <div style={{ padding: '24px', paddingBottom: 'max(60px, env(safe-area-inset-bottom))', textAlign: 'center', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', position: 'relative', zIndex: 10 }}>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>
            {t('camera.title')}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0 }}>
            {t('scan.processing')}
          </p>
        </div>

        {/* Scanner video 스타일 오버라이드 */}
        <style>{`
          #scan-scanner video {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
          }
        `}</style>
      </div>
    )
  }

  const ScanResultScreen = () => {
    if (processing || !scanResultInfo) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0c', padding: '20px' }}>
          <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(251,191,36,0.1)', border: '2px solid rgba(251,191,36,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '28px' }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx="24" cy="24" r="22" stroke="#fbbf24" strokeWidth="2.5" strokeDasharray="10 5" />
            </svg>
          </div>
          <h2 style={{ color: '#fbbf24', fontSize: '22px', fontWeight: '600', marginBottom: '12px' }}>{t('verify.title')}...</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '15px' }}>{t('verify.subtitle')}</p>
          {dinaId && (
            <div style={{ marginTop: '24px', padding: '14px 20px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginBottom: '4px' }}>DINA 코드</p>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px', fontFamily: 'monospace', letterSpacing: '0.05em', margin: 0 }}>{dinaId}</p>
            </div>
          )}
          <button onClick={safeGoHome} style={{ marginTop: '40px', padding: '14px 28px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: '15px', cursor: 'pointer' }}>{t('verify.cancel')}</button>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )
    }

    const getStatusConfig = () => {
      switch (scanResultInfo.status) {
        case 'PENDING': return {
          color: '#fbbf24',
          text: t('result.pending'),
          icon: (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="#fbbf24" strokeWidth="2.5" />
              <path d="M24 14v12" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
              <circle cx="24" cy="33" r="2" fill="#fbbf24" />
            </svg>
          )
        };
        case 'CLAIMED': return {
          color: '#4ade80',
          text: t('result.valid'),
          icon: (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="#4ade80" strokeWidth="2.5" />
              <path d="M15 24l6 6 12-12" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )
        };
        case 'ALREADY_CLAIMED': return {
          color: '#f97316',
          text: t('register.alreadyTitle'),
          icon: (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="#f97316" strokeWidth="2.5" />
              <path d="M24 14v12" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
              <circle cx="24" cy="33" r="2" fill="#f97316" />
            </svg>
          )
        };
        case 'EXPIRED': return {
          color: '#6b7280',
          text: t('error.session'),
          icon: (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="#6b7280" strokeWidth="2.5" />
              <path d="M17 17l14 14M31 17l-14 14" stroke="#6b7280" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )
        };
        case 'ERROR': return {
          color: '#f87171',
          text: t('result.invalid'),
          icon: (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="#f87171" strokeWidth="2.5" />
              <path d="M17 17l14 14M31 17l-14 14" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )
        };
        default: return { color: 'rgba(255,255,255,0.6)', text: '', icon: null };
      }
    };

    const config = getStatusConfig();

    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '40px' }}>
          <button onClick={safeGoHome} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <BackArrow />
          </button>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', marginLeft: '16px', letterSpacing: '0.05em' }}>{t('records.title')}</span>
        </div>

        {/* 결과 영역 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {/* 아이콘 */}
          <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: `${config.color}15`, border: `2px solid ${config.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '28px' }}>
            {config.icon}
          </div>

          {/* 상태 텍스트 */}
          <h2 style={{ color: config.color, fontSize: '22px', fontWeight: '600', marginBottom: '12px', letterSpacing: '0.02em' }}>{config.text}</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '15px', textAlign: 'center', maxWidth: '300px', lineHeight: '1.6' }}>{scanResultInfo?.message}</p>

          {/* DINA 코드 표시 */}
          {dinaId && (
            <div style={{ marginTop: '24px', padding: '14px 20px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginBottom: '4px' }}>DINA 코드</p>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px', fontFamily: 'monospace', letterSpacing: '0.05em', margin: 0 }}>{dinaId}</p>
            </div>
          )}

          {/* 네트워크 에러 시 재시도 */}
          {networkError && (
            <button onClick={safeGoScan} style={{ marginTop: '24px', padding: '14px 28px', borderRadius: '12px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: '15px', cursor: 'pointer' }}>
              {t('common.scanAgain')}
            </button>
          )}
        </div>

        {/* 하단 버튼 */}
        <div style={{ display: 'flex', gap: '12px', paddingBottom: 'max(60px, env(safe-area-inset-bottom))' }}>
          {scanResultInfo?.status === 'PENDING' && (
            <>
              <button onClick={safeGoCamera} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', fontWeight: '500', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', cursor: 'pointer' }}>{t('capture.title')}</button>
              <button onClick={safeGoHome} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>{t('common.close')}</button>
            </>
          )}
          {scanResultInfo?.status === 'CLAIMED' && (
            <button onClick={safeGoHome} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', fontWeight: '500', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', cursor: 'pointer' }}>{t('common.confirm')}</button>
          )}
          {scanResultInfo?.status === 'ALREADY_CLAIMED' && (
            <>
              <button onClick={safeGoHome} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>{t('common.home')}</button>
              <button onClick={() => window.open('mailto:support@artion.com')} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer' }}>{t('common.contact')}</button>
            </>
          )}
          {(scanResultInfo?.status === 'EXPIRED' || scanResultInfo?.status === 'ERROR') && (
            <>
              <button onClick={safeGoScan} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer' }}>{t('common.scanAgain')}</button>
              <button onClick={safeGoHome} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>{t('common.home')}</button>
            </>
          )}
        </div>
      </div>
    )
  }

  // 에러코드별 사용자 메시지
  const getErrorCodeMessage = (code: string | null): { title: string; message: string; color: string } | null => {
    switch (code) {
      case 'BATCH_NOT_SHIPPED':
        return { title: t('error.batch'), message: t('error.batch'), color: '#f97316' };
      case 'BATCH_TEMPORARILY_LOCKED':
        return { title: t('error.batch'), message: t('error.batch'), color: '#f97316' };
      case 'RATE_LIMIT_EXCEEDED':
        return { title: t('error.rateLimit'), message: t('error.rateLimit'), color: '#fbbf24' };
      case 'WRITE_GATE_FAILED':
        return { title: t('error.device'), message: t('error.device'), color: '#f87171' };
      default:
        return null;
    }
  };

  const ResultScreen = () => {
    const isCamera = scanMode === 'camera';
    const errInfo = getErrorCodeMessage(errorCode);
    const getStatusColor = () => {
      if (errInfo) return errInfo.color;
      switch (verifyStatus) {
        case 'VALID': return '#4ade80';
        case 'SUSPECT': return '#fbbf24';
        case 'INVALID': return '#f87171';
        case 'UNKNOWN': return '#f97316';
        default: return 'rgba(255,255,255,0.6)';
      }
    };
    const getStatusText = () => {
      if (errInfo) return errInfo.title;
      switch (verifyStatus) {
        case 'VALID': return t('result.valid');
        case 'SUSPECT': return t('result.suspect');
        case 'INVALID': return t('result.invalid');
        case 'UNKNOWN': return t('result.unknown');
        default: return t('result.pending');
      }
    };
    const getStatusMessage = () => {
      if (errInfo) return errInfo.message;
      switch (verifyStatus) {
        case 'VALID': return t('result.validDesc');
        case 'SUSPECT': return t('result.suspectDesc');
        case 'INVALID': return t('result.invalidDesc');
        case 'UNKNOWN': return t('result.unknownDesc');
        default: return '';
      }
    };
    const getStatusIcon = () => {
      const color = getStatusColor();
      switch (verifyStatus) {
        case 'VALID': return (
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="15" stroke={color} strokeWidth="2" />
            <path d="M10 16l4 4 8-8" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
        case 'SUSPECT': return (
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path d="M16 3L2 28h28L16 3z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
            <path d="M16 13v7" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="16" cy="24" r="1.5" fill={color} />
          </svg>
        );
        case 'INVALID': return (
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="15" stroke={color} strokeWidth="2" />
            <path d="M11 11l10 10M21 11l-10 10" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        );
        case 'UNKNOWN': return (
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="15" stroke={color} strokeWidth="2" />
            <path d="M12 12a4 4 0 014-4 4 4 0 014 4c0 2-2 3-3 4s-1 2-1 3" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="16" cy="24" r="1.5" fill={color} />
          </svg>
        );
        default: return null;
      }
    };
    const handleRetry = useCallback(() => {
      setQrDetected(false); setQrData(null); setCapturedImage(null); setRecordInfo(null); setError(null); setProcessing(false); setVerifyStatus(null);
      if (isCamera) {
        setScreen('camera');
      } else {
        setScreen('home');
        setTimeout(() => openGalleryPicker(), 50);
      }
    }, [isCamera, openGalleryPicker]);
    const handleRegister = async () => {
      if (!sessionToken || !dinaId || !nonce) return;
      setRegistering(true);
      try {
        const res = await registerWithServer(sessionToken, dinaId, nonce);
        setRegisterStatus(res.status);
        if (!res.success) setRegisterError(res.error_code || res.error || 'UNKNOWN');
        setScreen('registerResult');
      } catch (e) {
        setRegisterStatus('FAILED');
        setRegisterError('NETWORK_ERROR');
        setScreen('registerResult');
      }
      setRegistering(false);
    };
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {capturedImage && <img src={capturedImage} alt="captured" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          {previewImage && !capturedImage && <img src={previewImage} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '48px', background: 'linear-gradient(to top, #0a0a0c, transparent)' }} />
          <button onClick={safeGoHome} style={{ position: 'absolute', top: 'max(48px, env(safe-area-inset-top))', left: '16px', width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><BackArrow /></button>
          <div style={{ position: 'absolute', top: 'max(52px, calc(env(safe-area-inset-top) + 4px))', right: '16px', padding: '6px 14px', borderRadius: '9999px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{isCamera ? t('capture.title') : t('capture.gallery')}</div>
        </div>
        <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: '6px', background: '#0a0a0c' }}>
          <div style={{ background: `${getStatusColor()}10`, border: `1px solid ${getStatusColor()}30`, borderRadius: '12px', padding: '12px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '9999px', background: `${getStatusColor()}15`, border: `1px solid ${getStatusColor()}40`, marginBottom: '8px' }}>
              {getStatusIcon()}
              <span style={{ fontSize: '13px', fontWeight: '500', color: getStatusColor() }}>{getStatusText()}</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', marginBottom: '8px', lineHeight: '1.4' }}>{getStatusMessage()}</p>
            {matchScore !== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>{t('records.status')}</span>
                <span style={{ color: getStatusColor(), fontSize: '12px', fontWeight: '500' }}>{(matchScore * 100).toFixed(1)}%</span>
              </div>
            )}
            {confidence !== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>{t('result.pending')}</span>
                <span style={{ color: getStatusColor(), fontSize: '12px', fontWeight: '500' }}>{confidence}%</span>
              </div>
            )}
            {signatureVerified !== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>Signature</span>
                <span style={{ color: signatureVerified ? '#4ade80' : '#f87171', fontSize: '12px', fontWeight: '500' }}>{signatureVerified ? 'PASS' : 'FAIL'}</span>
              </div>
            )}
            {recordInfo && verifyStatus === 'VALID' && (
              <div style={{ paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>Record ID</span><span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px', fontFamily: 'monospace' }}>{recordInfo.recordId.slice(0, 18)}...</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>Pack Hash</span><span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px', fontFamily: 'monospace' }}>{recordInfo.packHash.slice(0, 16)}...</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>{t('records.date')}</span><span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>{new Date(recordInfo.createdAt).toLocaleString('ko-KR')}</span></div>
              </div>
            )}
            {networkError && (
              <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(251,191,36,0.1)', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.2)' }}>
                <p style={{ color: '#fbbf24', fontSize: '12px', margin: 0 }}>{t('error.network')}</p>
                <button onClick={handleRetry} style={{ marginTop: '8px', padding: '8px 16px', borderRadius: '8px', background: 'rgba(251,191,36,0.2)', border: 'none', color: '#fbbf24', fontSize: '12px', cursor: 'pointer' }}>{t('common.retry')}</button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px', paddingBottom: 'max(60px, env(safe-area-inset-bottom))' }}>
            <button onClick={safeGoHome} style={{ flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>{t('common.confirm')}</button>
            {verifyStatus === 'VALID' && sessionToken && (
              <button onClick={handleRegister} disabled={registering} style={{ flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', background: registering ? 'rgba(74,222,128,0.3)' : 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontWeight: '500', cursor: registering ? 'default' : 'pointer' }}>{registering ? t('register.processing') + '...' : t('register.button')}</button>
            )}
            {(verifyStatus === 'SUSPECT' || verifyStatus === 'UNKNOWN' || verifyStatus === 'INVALID') && (
              <button onClick={handleRetry} style={{ flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', background: verifyStatus === 'SUSPECT' ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.06)', border: `1px solid ${verifyStatus === 'SUSPECT' ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.1)'}`, color: verifyStatus === 'SUSPECT' ? '#fbbf24' : 'white', cursor: 'pointer' }}>{t('capture.retry')}</button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // GalleryScreen - 더 이상 사용하지 않음 (safeGoGallery에서 바로 ImagePicker 실행)
  // 만약 이 화면에 도달하면 홈으로 리다이렉트
  const GalleryScreen = () => {
    useEffect(() => {
      safeGoHome()
    }, [])
    return null
  };

  const PreviewScreen = () => {
    const [verifying, setVerifying] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const handleVerify = async () => {
      setVerifying(true); setAnalysisError(null);
      if (previewImage) {
        try {
          setCapturedImage(previewImage);
          await runPipeline(null, previewImage);
        } catch (e) {
          setAnalysisError(t('common.loading'));
          setVerifying(false);
        }
      }
    };
    const handleBack = () => {
      if (verifying) { setShowCancelConfirm(true); }
      else { setScreen('gallery'); }
    };
    const confirmCancel = () => {
      setShowCancelConfirm(false);
      setVerifying(false);
      setScreen('gallery');
    };
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0c', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={handleBack} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><BackArrow /></button>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', letterSpacing: '0.1em' }}>{t('capture.gallery')}</span>
          <div style={{ width: '40px' }} />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <img src={previewImage} alt="" style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: '12px' }} />
        </div>
        <div style={{ padding: '20px', paddingBottom: 'max(60px, env(safe-area-inset-bottom))' }}>
          {analysisError && <p style={{ color: '#f87171', fontSize: '14px', marginBottom: '8px', textAlign: 'center' }}>{analysisError}</p>}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => setScreen('gallery')} style={{ flex: 1, padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: '14px', cursor: 'pointer' }}>{t('capture.retry')}</button>
            <button onClick={handleVerify} disabled={verifying} style={{ flex: 1, padding: '16px', borderRadius: '12px', background: verifying ? 'rgba(74,222,128,0.3)' : 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: '16px', fontWeight: '500', cursor: verifying ? 'default' : 'pointer' }}>{verifying ? t('verify.title') + '...' : t('common.confirm')}</button>
          </div>
        </div>
        {showCancelConfirm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#1a1a1c', borderRadius: '16px', padding: '24px', maxWidth: '300px', textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '16px', marginBottom: '20px' }}>{t('verify.cancel')}?</p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowCancelConfirm(false)} style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', cursor: 'pointer' }}>{t('common.confirm')}</button>
                <button onClick={confirmCancel} style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', cursor: 'pointer' }}>{t('verify.cancel')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const OtpInputScreen = () => {
    const handleOtpSubmit = () => {
      if (otpInput.length === 8) {
        const updatedQr = (qrData || '') + ' OTP-' + otpInput.toUpperCase();
        setQrData(updatedQr);
        setScanMode('camera');
        setQrDetected(true);
        setCapturedImage(null);
        setRecordInfo(null);
        setError(null);
        setErrorCode(null);
        setProcessing(false);
        setNetworkError(false);
        setVerifyStatus(null);
        setCameraError(null);
        setScreen('camera');
      }
    };
    const dinaMatch = qrData?.match(/DINA-[A-Z0-9]{13}/);
    const dinaDisplay = dinaMatch ? dinaMatch[0] : qrData || '';
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '40px' }}>
          <button onClick={safeGoScan} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><BackArrow /></button>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', marginLeft: '16px', letterSpacing: '0.1em' }}>{t('otp.title')}</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '40px' }}>
          <div style={{ marginBottom: '32px', padding: '12px 20px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '4px' }}>DINA 코드</p>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '16px', fontFamily: 'monospace', letterSpacing: '0.1em', margin: 0 }}>{dinaDisplay}</p>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', textAlign: 'center', marginBottom: '24px', maxWidth: '280px', lineHeight: '1.5' }}>{t('otp.subtitle')}</p>
          <input
            type="text"
            value={otpInput}
            onChange={(e) => setOtpInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
            maxLength={8}
            placeholder="OTP"
            style={{
              width: '240px', padding: '16px', fontSize: '20px', fontFamily: 'monospace', letterSpacing: '0.3em', textAlign: 'center',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px',
              color: 'rgba(255,255,255,0.9)', outline: 'none', textTransform: 'uppercase',
            }}
          />
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginTop: '8px' }}>{otpInput.length}/8</p>
          <button
            onClick={handleOtpSubmit}
            disabled={otpInput.length !== 8}
            style={{
              marginTop: '24px', width: '240px', padding: '14px', borderRadius: '12px', fontSize: '15px', fontWeight: '500',
              background: otpInput.length === 8 ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${otpInput.length === 8 ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.06)'}`,
              color: otpInput.length === 8 ? '#4ade80' : 'rgba(255,255,255,0.3)',
              cursor: otpInput.length === 8 ? 'pointer' : 'not-allowed',
            }}
          >{t('otp.confirm')}</button>
        </div>
        <div style={{ paddingBottom: 'max(40px, env(safe-area-inset-bottom))' }} />
      </div>
    );
  };

  const RegisterResultScreen = () => {
    const getRegisterInfo = () => {
      if (registerStatus === 'ACTIVATED') {
        return {
          color: '#4ade80',
          title: t('register.successTitle'),
          message: t('register.successMessage'),
          icon: (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="#4ade80" strokeWidth="2.5" />
              <path d="M15 24l6 6 12-12" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ),
        };
      }
      if (registerStatus === 'ALREADY_ACTIVATED') {
        return {
          color: '#fbbf24',
          title: t('register.alreadyTitle'),
          message: t('register.alreadyMessage'),
          icon: (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="#fbbf24" strokeWidth="2.5" />
              <path d="M24 14v12" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
              <circle cx="24" cy="33" r="2" fill="#fbbf24" />
            </svg>
          ),
        };
      }
      const errorMessages: Record<string, string> = {
        SESSION_NOT_VERIFIED: t('error.session'),
        DINA_MISMATCH: t('result.invalid'),
        ASSET_NOT_FOUND: t('result.unknown'),
        BATCH_NOT_SHIPPED: t('error.batch'),
        NETWORK_ERROR: t('error.network'),
      };
      const msg = (registerError && errorMessages[registerError]) || t('error.server');
      return {
        color: '#f87171',
        title: t('result.invalid'),
        message: msg,
        icon: (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#f87171" strokeWidth="2.5" />
            <path d="M17 17l14 14M31 17l-14 14" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ),
      };
    };
    const info = getRegisterInfo();
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: `${info.color}10`, border: `2px solid ${info.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
            {info.icon}
          </div>
          <h2 style={{ color: info.color, fontSize: '22px', fontWeight: '500', marginBottom: '12px' }}>{info.title}</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', textAlign: 'center', maxWidth: '280px', lineHeight: '1.5' }}>{info.message}</p>
        </div>
        <div style={{ paddingBottom: 'max(60px, env(safe-area-inset-bottom))' }}>
          <button onClick={safeGoHome} style={{ width: '100%', padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>{t('common.home')}</button>
        </div>
      </div>
    );
  };

  const SettingsScreen = () => {
    const currentLang = i18n.language;
    const changeLang = (lng: string) => { i18n.changeLanguage(lng); };
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
          <button onClick={safeGoHome} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginRight: '16px' }}><BackArrow /></button>
          <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '18px', margin: 0 }}>{t('settings.title')}</h2>
        </div>
        <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', marginBottom: '12px' }}>{t('settings.language')}</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => changeLang('en')} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: currentLang === 'en' ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)', border: currentLang === 'en' ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.08)', color: currentLang === 'en' ? '#4ade80' : 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: currentLang === 'en' ? '500' : '300', cursor: 'pointer' }}>English</button>
            <button onClick={() => changeLang('ko')} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: currentLang === 'ko' ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)', border: currentLang === 'ko' ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.08)', color: currentLang === 'ko' ? '#4ade80' : 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: currentLang === 'ko' ? '500' : '300', cursor: 'pointer' }}>한국어</button>
          </div>
        </div>
        <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', margin: 0 }}>GeoCam V2.1</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: '4px 0 0 0' }}>Powered by Artion</p>
        </div>
      </div>
    );
  };

  const RecordsScreen = () => {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c' }}>
        <div style={{ padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={safeGoHome} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><BackArrow /></button>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300' }}>{t('records.title')}</span>
          <div style={{ width: '40px' }} />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>{t('records.empty')}</p>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      {screen === 'home' && <HomeScreen />}
      {screen === 'camera' && <CameraScreen />}
      {screen === 'scan' && <ScanScreen />}
      {screen === 'scanResult' && <ScanResultScreen />}
      {screen === 'result' && <ResultScreen />}
      {screen === 'records' && <RecordsScreen />}
      {screen === 'gallery' && <GalleryScreen />}
      {screen === 'preview' && <PreviewScreen />}
      {screen === 'otpInput' && <OtpInputScreen />}
      {screen === 'registerResult' && <RegisterResultScreen />}
      {screen === 'settings' && <SettingsScreen />}
    </ErrorBoundary>
  )
}

export default App