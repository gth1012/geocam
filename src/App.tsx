import { useState, useRef, useCallback, useEffect, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { runEvidencePipeline, registerWithServer } from './evidencePipeline'
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
      setSessionToken(null); setNonce(null); setDinaId(null); setSignatureVerified(null); setConfidence(null);
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
    setProcessing(true); setError(null); setErrorCode(null); setNetworkError(false);
    try {
      const result = await runEvidencePipeline({ qrRaw, imageUri, geoBucket: null, deviceFingerprintHash: getDeviceFingerprint() });
      if (result.error_code) setErrorCode(result.error_code);
      if (result.sessionToken) setSessionToken(result.sessionToken);
      if (result.nonce) setNonce(result.nonce);
      if (result.dinaId) setDinaId(result.dinaId);
      if (result.signatureVerified !== undefined) setSignatureVerified(result.signatureVerified);
      if (result.confidence !== undefined && result.confidence !== null) setConfidence(result.confidence);
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
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', letterSpacing: '0.2em' }}>정품 인증 시스템</p>
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
            setCameraError('카메라 권한이 거부되었습니다. 설정에서 권한을 허용해 주세요.')
          } else if (err.name === 'NotFoundError') {
            setCameraError('카메라를 찾을 수 없습니다.')
          } else if (err.name === 'NotReadableError') {
            setCameraError('카메라가 다른 앱에서 사용 중입니다.')
          } else {
            setCameraError('카메라를 시작할 수 없습니다: ' + err.message)
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
    const capturePhoto = useCallback(() => {
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

      // 상태 업데이트 및 결과 화면으로 이동
      setCapturedImage(imageDataUrl)
      setScanMode('camera')

      // 파이프라인 실행 (QR 없이 이미지만)
      runPipeline(null, imageDataUrl)

      setCapturing(false)
    }, [cameraReady, stopCamera])

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
            <p style={{ color: '#f87171', fontSize: '18px', fontWeight: '500', marginBottom: '12px' }}>카메라 접근 불가</p>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', textAlign: 'center', maxWidth: '280px', lineHeight: '1.5', marginBottom: '32px' }}>{cameraError}</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={handleBack} style={{ padding: '14px 24px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '15px', cursor: 'pointer' }}>홈으로</button>
              <button onClick={startCamera} style={{ padding: '14px 24px', borderRadius: '12px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: '15px', cursor: 'pointer' }}>다시 시도</button>
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
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', letterSpacing: '0.1em' }}>실물 촬영</span>
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
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>카메라 준비 중...</p>
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
            제품 실물을 프레임 안에 맞추고 촬영하세요
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

  // ScanScreen - @yudiel/react-qr-scanner 사용 (통합됨) - 수정 금지
  const ScanScreen = () => {
    const [localProcessing, setLocalProcessing] = useState(false)
    const [scanError, setScanError] = useState<string | null>(null)
    const scanLockRef = useRef(false)

    // GeoStudio API 검증 함수
    const verifyWithAPI = async (dinaCode: string) => {
      setProcessing(true)
      setNetworkError(false)
      setErrorCode(null)
      setDinaId(dinaCode)

      try {
        const response = await fetch('https://geostudio-api-production.up.railway.app/api/geocam/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dinaId: dinaCode, deviceFingerprint: getDeviceFingerprint() })
        })

        if (!response.ok) {
          if (response.status >= 500) {
            setNetworkError(true)
            setScanResultInfo({
              status: 'ERROR',
              message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
            })
          } else {
            setScanResultInfo({
              status: 'ERROR',
              message: `요청 처리에 실패했습니다. (${response.status})`
            })
          }
          setProcessing(false)
          setScreen('scanResult')
          return
        }

        let result
        try {
          result = await response.json()
        } catch (jsonErr) {
          setScanResultInfo({
            status: 'ERROR',
            message: '서버 응답을 처리할 수 없습니다.'
          })
          setProcessing(false)
          setScreen('scanResult')
          return
        }

        const apiResult = result.result || result.status
        const apiError = result.error || result.error_code

        if (result.success || apiResult === 'VALID') {
          if (result.sessionToken) setSessionToken(result.sessionToken)
          setScanResultInfo({
            status: 'CLAIMED',
            message: '정품임이 확인되었습니다.'
          })
        } else if (apiResult === 'ALREADY_ACTIVATED' || apiError === 'ALREADY_ACTIVATED') {
          setScanResultInfo({
            status: 'ALREADY_CLAIMED',
            message: '이미 등록된 제품입니다.'
          })
        } else if (apiError === 'SESSION_EXPIRED') {
          setScanResultInfo({
            status: 'ERROR',
            message: '세션이 만료되었습니다. 다시 스캔해 주세요.'
          })
        } else if (apiResult === 'NOT_FOUND' || apiError === 'ASSET_NOT_FOUND') {
          setScanResultInfo({
            status: 'ERROR',
            message: '등록되지 않은 코드입니다.'
          })
        } else if (apiResult === 'INVALID') {
          setScanResultInfo({
            status: 'ERROR',
            message: '유효하지 않은 코드입니다.'
          })
        } else if (apiError === 'RATE_LIMIT_EXCEEDED') {
          setErrorCode('RATE_LIMIT_EXCEEDED')
          setScanResultInfo({
            status: 'ERROR',
            message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
          })
        } else {
          setScanResultInfo({
            status: 'ERROR',
            message: apiError || result.message || '오류가 발생했습니다.'
          })
        }
      } catch (err) {
        console.error('API verify error:', err)
        setNetworkError(true)
        setScanResultInfo({
          status: 'ERROR',
          message: '서버 연결에 실패했습니다. 네트워크를 확인해 주세요.'
        })
      }

      setProcessing(false)
      setScreen('scanResult')
    }

    // QR 스캔 성공 시 처리
    const handleQrDetected = useCallback(async (result: any) => {
      // 중복 스캔 방지 (useRef + localProcessing 이중 가드)
      if (scanLockRef.current || localProcessing) return

      if (result && result[0]?.rawValue) {
        const data = result[0].rawValue
        if (data.includes('DINA-')) {
          // 스캔 락 설정
          scanLockRef.current = true
          setLocalProcessing(true)
          setQrData(data)
          setQrDetected(true)

          // DINA 코드 추출
          const dinaMatch = data.match(/DINA-[A-Z0-9]{12,13}/)
          const dinaCode = dinaMatch ? dinaMatch[0] : null

          if (dinaCode) {
            await verifyWithAPI(dinaCode)
          } else {
            setScanError('DINA 코드 형식이 올바르지 않습니다')
            setTimeout(() => setScanError(null), 2000)
            scanLockRef.current = false
            setLocalProcessing(false)
          }
        } else {
          setScanError('DINA 코드가 포함되지 않은 QR입니다')
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
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', letterSpacing: '0.1em' }}>QR 스캔</span>
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
                setCameraError('카메라에 접근할 수 없습니다. 권한을 확인해 주세요.')
              }}
            />
          </div>

          {/* 카메라 에러 표시 */}
          {cameraError && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: '#0a0a0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
              <p style={{ color: '#f87171', fontSize: '16px', marginBottom: '12px' }}>카메라 접근 불가</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', textAlign: 'center', marginBottom: '24px' }}>{cameraError}</p>
              <button onClick={safeGoHome} style={{ padding: '12px 24px', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer' }}>홈으로</button>
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
              <p style={{ color: '#4ade80', fontSize: '16px', margin: 0 }}>처리 중...</p>
            </div>
          )}
        </div>

        {/* 하단 안내 */}
        <div style={{ padding: '24px', paddingBottom: 'max(60px, env(safe-area-inset-bottom))', textAlign: 'center', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', position: 'relative', zIndex: 10 }}>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>
            DINA QR 코드를 스캔하세요
          </p>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0 }}>
            QR 코드가 인식되면 자동으로 처리됩니다
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
          <h2 style={{ color: '#fbbf24', fontSize: '22px', fontWeight: '600', marginBottom: '12px' }}>검증 중...</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '15px' }}>잠시만 기다려 주세요</p>
          {dinaId && (
            <div style={{ marginTop: '24px', padding: '14px 20px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginBottom: '4px' }}>DINA 코드</p>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px', fontFamily: 'monospace', letterSpacing: '0.05em', margin: 0 }}>{dinaId}</p>
            </div>
          )}
          <button onClick={safeGoHome} style={{ marginTop: '40px', padding: '14px 28px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: '15px', cursor: 'pointer' }}>취소</button>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )
    }

    const getStatusConfig = () => {
      switch (scanResultInfo.status) {
        case 'PENDING': return {
          color: '#fbbf24',
          text: '등록 대기중',
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
          text: '정품 확인 완료',
          icon: (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="#4ade80" strokeWidth="2.5" />
              <path d="M15 24l6 6 12-12" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )
        };
        case 'ALREADY_CLAIMED': return {
          color: '#f97316',
          text: '이미 등록된 제품',
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
          text: '만료됨',
          icon: (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="#6b7280" strokeWidth="2.5" />
              <path d="M17 17l14 14M31 17l-14 14" stroke="#6b7280" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )
        };
        case 'ERROR': return {
          color: '#f87171',
          text: '검증 실패',
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
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', marginLeft: '16px', letterSpacing: '0.05em' }}>스캔 결과</span>
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
              다시 스캔하기
            </button>
          )}
        </div>

        {/* 하단 버튼 */}
        <div style={{ display: 'flex', gap: '12px', paddingBottom: 'max(60px, env(safe-area-inset-bottom))' }}>
          {scanResultInfo?.status === 'PENDING' && (
            <>
              <button onClick={safeGoCamera} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', fontWeight: '500', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', cursor: 'pointer' }}>실물 촬영하기</button>
              <button onClick={safeGoHome} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>나중에</button>
            </>
          )}
          {scanResultInfo?.status === 'CLAIMED' && (
            <button onClick={safeGoHome} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', fontWeight: '500', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', cursor: 'pointer' }}>확인</button>
          )}
          {scanResultInfo?.status === 'ALREADY_CLAIMED' && (
            <>
              <button onClick={safeGoHome} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>홈으로</button>
              <button onClick={() => window.open('mailto:support@artion.com')} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer' }}>문의하기</button>
            </>
          )}
          {(scanResultInfo?.status === 'EXPIRED' || scanResultInfo?.status === 'ERROR') && (
            <>
              <button onClick={safeGoScan} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer' }}>다시 스캔</button>
              <button onClick={safeGoHome} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>홈으로</button>
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
        return { title: '미출고 제품', message: '아직 출고되지 않은 제품입니다. 제품을 구매한 판매처에 문의해 주세요.', color: '#f97316' };
      case 'BATCH_TEMPORARILY_LOCKED':
        return { title: '검증 일시 중단', message: '해당 배치 제품군의 검증이 일시 중단되었습니다. 잠시 후 다시 시도해 주세요.', color: '#f97316' };
      case 'RATE_LIMIT_EXCEEDED':
        return { title: '요청 제한', message: '짧은 시간에 요청이 너무 많았습니다. 1분 후 다시 시도해 주세요.', color: '#fbbf24' };
      case 'WRITE_GATE_FAILED':
        return { title: '보안 검증 실패', message: '디바이스 보안 검증에 실패했습니다. 앱을 재시작한 후 다시 시도해 주세요.', color: '#f87171' };
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
        case 'VALID': return '정품 확인 (AUTHENTIC)';
        case 'SUSPECT': return '검토 필요 (SUSPICIOUS)';
        case 'INVALID': return '정보 불일치 (MISMATCH)';
        case 'UNKNOWN': return '미등록 제품 (UNREGISTERED)';
        default: return '확인중';
      }
    };
    const getStatusMessage = () => {
      if (errInfo) return errInfo.message;
      switch (verifyStatus) {
        case 'VALID': return '이 제품은 정품임이 확인되었습니다. 촬영 정보와 실물이 일치합니다.';
        case 'SUSPECT': return '인식되었으나 신뢰도가 낮습니다. 조명과 각도를 조정하여 다시 촬영해 주세요.';
        case 'INVALID': return '촬영된 이미지와 등록된 정품 정보가 일치하지 않습니다. 정품 여부를 확인해 주세요.';
        case 'UNKNOWN': return '이 제품은 정품 정보가 등록되어 있지 않습니다. 제품 판매처에 문의해 주세요.';
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
          <div style={{ position: 'absolute', top: 'max(52px, calc(env(safe-area-inset-top) + 4px))', right: '16px', padding: '6px 14px', borderRadius: '9999px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{isCamera ? '실물 촬영' : '갤러리'}</div>
        </div>
        <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: '6px', background: '#0a0a0c' }}>
          <div style={{ background: `${getStatusColor()}10`, border: `1px solid ${getStatusColor()}30`, borderRadius: '12px', padding: '12px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '9999px', background: `${getStatusColor()}15`, border: `1px solid ${getStatusColor()}40`, marginBottom: '8px' }}>
              {getStatusIcon()}
              <span style={{ fontSize: '13px', fontWeight: '500', color: getStatusColor() }}>{getStatusText()}</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', marginBottom: '8px', lineHeight: '1.4' }}>{getStatusMessage()}</p>
            {confidence !== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>신뢰도</span>
                <span style={{ color: getStatusColor(), fontSize: '12px', fontWeight: '500' }}>{confidence}%</span>
              </div>
            )}
            {signatureVerified !== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>서명 검증</span>
                <span style={{ color: signatureVerified ? '#4ade80' : '#f87171', fontSize: '12px', fontWeight: '500' }}>{signatureVerified ? 'PASS' : 'FAIL'}</span>
              </div>
            )}
            {recordInfo && verifyStatus === 'VALID' && (
              <div style={{ paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>Record ID</span><span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px', fontFamily: 'monospace' }}>{recordInfo.recordId.slice(0, 18)}...</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>Pack Hash</span><span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px', fontFamily: 'monospace' }}>{recordInfo.packHash.slice(0, 16)}...</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>등록 시각</span><span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>{new Date(recordInfo.createdAt).toLocaleString('ko-KR')}</span></div>
              </div>
            )}
            {networkError && (
              <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(251,191,36,0.1)', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.2)' }}>
                <p style={{ color: '#fbbf24', fontSize: '12px', margin: 0 }}>서버 연결에 실패했습니다.</p>
                <button onClick={handleRetry} style={{ marginTop: '8px', padding: '8px 16px', borderRadius: '8px', background: 'rgba(251,191,36,0.2)', border: 'none', color: '#fbbf24', fontSize: '12px', cursor: 'pointer' }}>재시도</button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px', paddingBottom: 'max(60px, env(safe-area-inset-bottom))' }}>
            <button onClick={safeGoHome} style={{ flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>확인</button>
            {verifyStatus === 'VALID' && sessionToken && (
              <button onClick={handleRegister} disabled={registering} style={{ flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', background: registering ? 'rgba(74,222,128,0.3)' : 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontWeight: '500', cursor: registering ? 'default' : 'pointer' }}>{registering ? '등록 중...' : '정품 등록'}</button>
            )}
            {(verifyStatus === 'SUSPECT' || verifyStatus === 'UNKNOWN' || verifyStatus === 'INVALID') && (
              <button onClick={handleRetry} style={{ flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', background: verifyStatus === 'SUSPECT' ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.06)', border: `1px solid ${verifyStatus === 'SUSPECT' ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.1)'}`, color: verifyStatus === 'SUSPECT' ? '#fbbf24' : 'white', cursor: 'pointer' }}>다시 촬영</button>
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
          setAnalysisError('이미지 처리 중 오류가 발생했습니다.');
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
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', letterSpacing: '0.1em' }}>미리보기</span>
          <div style={{ width: '40px' }} />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <img src={previewImage} alt="" style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: '12px' }} />
        </div>
        <div style={{ padding: '20px', paddingBottom: 'max(60px, env(safe-area-inset-bottom))' }}>
          {analysisError && <p style={{ color: '#f87171', fontSize: '14px', marginBottom: '8px', textAlign: 'center' }}>{analysisError}</p>}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => setScreen('gallery')} style={{ flex: 1, padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: '14px', cursor: 'pointer' }}>다시 선택</button>
            <button onClick={handleVerify} disabled={verifying} style={{ flex: 1, padding: '16px', borderRadius: '12px', background: verifying ? 'rgba(74,222,128,0.3)' : 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: '16px', fontWeight: '500', cursor: verifying ? 'default' : 'pointer' }}>{verifying ? '검증 중...' : '검증하기'}</button>
          </div>
        </div>
        {showCancelConfirm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#1a1a1c', borderRadius: '16px', padding: '24px', maxWidth: '300px', textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '16px', marginBottom: '20px' }}>분석이 진행 중입니다. 취소하시겠습니까?</p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowCancelConfirm(false)} style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', cursor: 'pointer' }}>계속</button>
                <button onClick={confirmCancel} style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', cursor: 'pointer' }}>취소</button>
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
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', marginLeft: '16px', letterSpacing: '0.1em' }}>OTP 입력</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '40px' }}>
          <div style={{ marginBottom: '32px', padding: '12px 20px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '4px' }}>DINA 코드</p>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '16px', fontFamily: 'monospace', letterSpacing: '0.1em', margin: 0 }}>{dinaDisplay}</p>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', textAlign: 'center', marginBottom: '24px', maxWidth: '280px', lineHeight: '1.5' }}>제품에 포함된 OTP 코드 8자리를 입력해 주세요</p>
          <input
            type="text"
            value={otpInput}
            onChange={(e) => setOtpInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
            maxLength={8}
            placeholder="OTP 코드 8자리"
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
          >확인</button>
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
          title: '정품 등록 완료',
          message: '이 제품이 정품으로 등록되었습니다.',
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
          title: '이미 등록된 제품',
          message: '이 제품은 이미 정품 등록이 완료되었습니다.',
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
        SESSION_NOT_VERIFIED: '세션이 만료되었습니다. 다시 시도해 주세요.',
        DINA_MISMATCH: '코드 정보가 일치하지 않습니다.',
        ASSET_NOT_FOUND: '등록되지 않은 제품입니다.',
        BATCH_NOT_SHIPPED: '아직 출고되지 않은 제품입니다.',
        NETWORK_ERROR: '서버 연결에 실패했습니다. 네트워크를 확인해 주세요.',
      };
      const msg = (registerError && errorMessages[registerError]) || '등록에 실패했습니다. 다시 시도해 주세요.';
      return {
        color: '#f87171',
        title: '등록 실패',
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
          <button onClick={safeGoHome} style={{ width: '100%', padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>홈으로</button>
        </div>
      </div>
    );
  };

  const SettingsScreen = () => {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
          <button onClick={safeGoHome} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginRight: '16px' }}><BackArrow /></button>
          <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '18px', margin: 0 }}>설정</h2>
        </div>
        <div style={{ marginTop: '40px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
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
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300' }}>인증 기록</span>
          <div style={{ width: '40px' }} />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>기록은 서버에서만 저장됩니다</p>
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
