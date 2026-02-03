import { useState, useRef, useCallback, useEffect } from 'react'
// jsQR import removed
import Webcam from 'react-webcam'
import { Scanner } from '@yudiel/react-qr-scanner'
import { runEvidencePipeline } from './evidencePipeline'
import './App.css'

type Screen = 'home' | 'camera' | 'scan' | 'scanResult' | 'result' | 'records' | 'gallery' | 'preview' | 'settings'
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
  const [qrDetected, setQrDetected] = useState(false)
  const [qrData, setQrData] = useState<string | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string>('')
  const [recordInfo, setRecordInfo] = useState<RecordInfo | null>(null)
  const [scanResultInfo, setScanResultInfo] = useState<ScanResultInfo | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<'VALID' | 'SUSPECT' | 'UNKNOWN' | 'INVALID' | null>(null)
  const [processing, setProcessing] = useState(false)
  const [, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [networkError, setNetworkError] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const webcamRef = useRef<Webcam>(null)

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
      setVerifyStatus(null); setCameraError(null); setScreen('home');
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

  const runPipeline = async (qrRaw: string | null, imageUri: string) => {
    setProcessing(true); setError(null); setErrorCode(null); setNetworkError(false);
    try {
      const result = await runEvidencePipeline({ qrRaw, imageUri, geoBucket: null, deviceFingerprintHash: getDeviceFingerprint() });
      console.log('pipeline result:', result);
      if (result.error_code) setErrorCode(result.error_code);
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

  const capturePhoto = useCallback(async () => {
    console.log('capturePhoto called');
    try { const ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = 800; osc.type = 'sine'; gain.gain.setValueAtTime(0.5, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15); osc.start(); osc.stop(ctx.currentTime + 0.15); } catch(e) {}
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) { setCapturedImage(imageSrc); await runPipeline(qrData || null, imageSrc); }
    }
  }, [qrData])

  const handleCameraQrScan = (result: any) => {
    if (result && result[0]?.rawValue && !qrDetected) {
      const data = result[0].rawValue;
      if (data.includes('DINA-')) { setQrData(data); setQrDetected(true); }
    }
  }

  const handleScanQrScan = async (result: any) => {
    if (result && result[0]?.rawValue && !processing) {
      const data = result[0].rawValue; setQrData(data);
      setProcessing(true); setNetworkError(false); setErrorCode(null);
      try {
        const { checkAssetStatus } = await import('./evidencePipeline');
        const verifyResult = await checkAssetStatus(data, getDeviceFingerprint());

        if (verifyResult.success) {
          if (verifyResult.status === 'SHIPPED') {
            setScanResultInfo({ status: 'PENDING', pendingId: 'PND-' + Date.now(), message: '실물 촬영을 완료하면 등록이 완료됩니다.' });
          } else if (verifyResult.status === 'ACTIVATED') {
            setScanResultInfo({ status: 'ALREADY_CLAIMED', message: '이미 등록된 코드입니다.' });
          } else if (verifyResult.status === 'UNKNOWN') {
            setScanResultInfo({ status: 'ERROR', message: '등록되지 않은 코드입니다.' });
          } else {
            setScanResultInfo({ status: 'PENDING', pendingId: 'PND-' + Date.now(), message: '실물 촬영을 완료하면 등록이 완료됩니다.' });
          }
        } else {
          const code = verifyResult.error_code || verifyResult.error || '';
          if (code === 'RATE_LIMIT_EXCEEDED') {
            setErrorCode('RATE_LIMIT_EXCEEDED');
            setScanResultInfo({ status: 'ERROR', message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
          } else if (code === 'BATCH_NOT_SHIPPED') {
            setErrorCode('BATCH_NOT_SHIPPED');
            setScanResultInfo({ status: 'ERROR', message: '아직 출하되지 않은 제품입니다. 판매처에 문의해 주세요.' });
          } else if (code === 'BATCH_TEMPORARILY_LOCKED') {
            setErrorCode('BATCH_TEMPORARILY_LOCKED');
            setScanResultInfo({ status: 'ERROR', message: '현재 이 제품군의 검증이 일시 중단되었습니다. 잠시 후 다시 시도해 주세요.' });
          } else if (code.includes('ALREADY') || code.includes('ACTIVATED')) {
            setScanResultInfo({ status: 'ALREADY_CLAIMED', message: '이미 등록된 코드입니다.' });
          } else if (code.includes('EXPIRED')) {
            setScanResultInfo({ status: 'EXPIRED', message: '유효하지 않은 코드입니다.' });
          } else {
            setScanResultInfo({ status: 'ERROR', message: verifyResult.error || '서버 오류가 발생했습니다.' });
          }
        }
      } catch (e) {
        setNetworkError(true);
        setScanResultInfo({ status: 'ERROR', message: '서버 연결에 실패했습니다.' });
      }
      setProcessing(false);
      setScreen('scanResult');
    }
  }

  const HomeScreen = () => (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 32px', backgroundColor: '#0a0a0c' }}>
      <div style={{ paddingTop: '120px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: '200', letterSpacing: '0.25em', marginBottom: '8px', color: 'rgba(255,255,255,0.9)' }}>Geo Cam</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', letterSpacing: '0.2em' }}>정품 인증 서비스</p>
      </div>
      <div style={{ marginTop: '100px', width: '260px' }}>
        <button onClick={safeGoCamera} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', fontWeight: '300', letterSpacing: '0.1em', cursor: 'pointer' }}>Camera</button>
        <div style={{ height: '50px' }} />
        <button onClick={safeGoScan} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', fontWeight: '300', letterSpacing: '0.1em', cursor: 'pointer' }}>Scan</button>
        <div style={{ height: '30px' }} />
        <button onClick={() => setScreen('gallery')} style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', fontWeight: '300', letterSpacing: '0.1em', fontSize: '14px', cursor: 'pointer' }}>Gallery</button>
      </div>
      <div style={{ position: 'absolute', bottom: 'max(40px, env(safe-area-inset-bottom))', textAlign: 'center', left: 0, right: 0 }}>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', letterSpacing: '0.2em' }}>Powered by Artion</p>
      </div>
    </div>
  )

  const CameraScreen = () => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={safeGoHome} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><BackArrow /></button>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', letterSpacing: '0.1em' }}>촬영</span>
        <div style={{ width: '40px' }} />
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <Webcam ref={webcamRef} audio={false} onUserMediaError={() => setCameraError('카메라 권한이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해 주세요.')} screenshotFormat="image/jpeg" videoConstraints={{ facingMode: 'environment', width: 1280, height: 720 }} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} />{cameraError && <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: '#0a0a0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}><p style={{ color: '#f87171', fontSize: '16px', marginBottom: '12px' }}>카메라 접근 불가</p><p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', textAlign: 'center', marginBottom: '24px' }}>{cameraError}</p><button onClick={safeGoHome} style={{ padding: '12px 24px', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer' }}>홈으로</button></div>}
        {!qrDetected && (<div style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none' }}><Scanner onScan={handleCameraQrScan} constraints={{ facingMode: 'environment' }} styles={{ container: { width: '100%', height: '100%' }, video: { width: '100%', height: '100%', objectFit: 'cover' } }} /></div>)}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '200px', height: '200px', zIndex: 10 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '40px', height: '40px', borderTop: `3px solid ${qrDetected ? '#4ade80' : 'rgba(255,255,255,0.6)'}`, borderLeft: `3px solid ${qrDetected ? '#4ade80' : 'rgba(255,255,255,0.6)'}`, borderTopLeftRadius: '12px' }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: '40px', height: '40px', borderTop: `3px solid ${qrDetected ? '#4ade80' : 'rgba(255,255,255,0.6)'}`, borderRight: `3px solid ${qrDetected ? '#4ade80' : 'rgba(255,255,255,0.6)'}`, borderTopRightRadius: '12px' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '40px', height: '40px', borderBottom: `3px solid ${qrDetected ? '#4ade80' : 'rgba(255,255,255,0.6)'}`, borderLeft: `3px solid ${qrDetected ? '#4ade80' : 'rgba(255,255,255,0.6)'}`, borderBottomLeftRadius: '12px' }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: '40px', height: '40px', borderBottom: `3px solid ${qrDetected ? '#4ade80' : 'rgba(255,255,255,0.6)'}`, borderRight: `3px solid ${qrDetected ? '#4ade80' : 'rgba(255,255,255,0.6)'}`, borderBottomRightRadius: '12px' }} />
          {qrDetected && (<div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '8px 16px', background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)', borderRadius: '8px' }}><span style={{ color: '#4ade80', fontSize: '12px' }}>QR 인식됨</span></div>)}
        </div>
      </div>
      <div style={{ padding: '24px', paddingBottom: 'max(60px, env(safe-area-inset-bottom))', textAlign: 'center', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', position: 'relative', zIndex: 10 }}>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', marginBottom: '20px' }}>{processing ? '처리 중...' : qrDetected ? 'QR 인식됨 - 촬영하세요' : '촬영 버튼을 누르세요'}</p>
        <button onClick={capturePhoto} disabled={processing} style={{ width: '72px', height: '72px', borderRadius: '50%', background: !processing ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)', border: '4px solid rgba(255,255,255,0.6)', cursor: !processing ? 'pointer' : 'not-allowed' }} />
      </div>
    </div>
  )

  const ScanScreen = () => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={safeGoHome} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><BackArrow /></button>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', letterSpacing: '0.1em' }}>QR 스캔</span>
        <div style={{ width: '40px' }} />
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <Scanner onScan={handleScanQrScan} constraints={{ facingMode: 'environment' }} styles={{ container: { position: 'absolute', inset: 0 }, video: { width: '100%', height: '100%', objectFit: 'cover' } }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '200px', height: '200px', zIndex: 10 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '40px', height: '40px', borderTop: '3px solid rgba(255,255,255,0.6)', borderLeft: '3px solid rgba(255,255,255,0.6)', borderTopLeftRadius: '12px' }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: '40px', height: '40px', borderTop: '3px solid rgba(255,255,255,0.6)', borderRight: '3px solid rgba(255,255,255,0.6)', borderTopRightRadius: '12px' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '40px', height: '40px', borderBottom: '3px solid rgba(255,255,255,0.6)', borderLeft: '3px solid rgba(255,255,255,0.6)', borderBottomLeftRadius: '12px' }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: '40px', height: '40px', borderBottom: '3px solid rgba(255,255,255,0.6)', borderRight: '3px solid rgba(255,255,255,0.6)', borderBottomRightRadius: '12px' }} />
        </div>
      </div>
      <div style={{ padding: '24px', paddingBottom: 'max(60px, env(safe-area-inset-bottom))', textAlign: 'center', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', position: 'relative', zIndex: 10 }}>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>{processing ? '처리 중...' : 'QR 코드를 화면에 맞춰주세요'}</p>
      </div>
    </div>
  )

  const ScanResultScreen = () => {
    const getStatusColor = () => {
      if (!scanResultInfo) return 'rgba(255,255,255,0.6)';
      switch (scanResultInfo.status) {
        case 'PENDING': return '#fbbf24';
        case 'CLAIMED': return '#4ade80';
        case 'ALREADY_CLAIMED': return '#f87171';
        case 'EXPIRED': return '#6b7280';
        case 'ERROR': return '#f87171';
        default: return 'rgba(255,255,255,0.6)';
      }
    };
    const getStatusText = () => {
      if (!scanResultInfo) return '';
      switch (scanResultInfo.status) {
        case 'PENDING': return '등록 대기중';
        case 'CLAIMED': return '최초 고객 인증 완료';
        case 'ALREADY_CLAIMED': return '이미 등록됨';
        case 'EXPIRED': return '만료됨';
        case 'ERROR': return '오류';
        default: return '';
      }
    };
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '40px' }}>
          <button onClick={safeGoHome} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><BackArrow /></button>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', marginLeft: '16px' }}>QR 등록 결과</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: `${getStatusColor()}20`, border: `2px solid ${getStatusColor()}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: getStatusColor() }} />
          </div>
          <h2 style={{ color: getStatusColor(), fontSize: '20px', fontWeight: '500', marginBottom: '8px' }}>{getStatusText()}</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', textAlign: 'center', maxWidth: '280px' }}>{scanResultInfo?.message}</p>
          {networkError && (
            <button onClick={safeGoScan} style={{ marginTop: '20px', padding: '12px 24px', borderRadius: '12px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: '14px', cursor: 'pointer' }}>재시도</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', paddingBottom: 'max(60px, env(safe-area-inset-bottom))' }}>
          {scanResultInfo?.status === 'PENDING' && (
            <>
              <button onClick={safeGoCamera} style={{ flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', cursor: 'pointer' }}>촬영하기</button>
              <button onClick={safeGoHome} style={{ flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>나중에</button>
            </>
          )}
          {scanResultInfo?.status === 'ALREADY_CLAIMED' && (
            <>
              <button onClick={safeGoHome} style={{ flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>홈으로</button>
              <button onClick={() => window.open('mailto:support@artion.com')} style={{ flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer' }}>문의하기</button>
            </>
          )}
          {(scanResultInfo?.status === 'EXPIRED' || scanResultInfo?.status === 'ERROR' || scanResultInfo?.status === 'CLAIMED') && (
            <button onClick={safeGoHome} style={{ flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>홈으로</button>
          )}
        </div>
      </div>
    )
  }

  // 에러코드별 사용자 메시지 (톤: 조언자O, 판사X)
  const getErrorCodeMessage = (code: string | null): { title: string; message: string; color: string } | null => {
    switch (code) {
      case 'BATCH_NOT_SHIPPED':
        return { title: '미출하 제품', message: '아직 출하되지 않은 제품입니다. 제품을 구매한 판매처에 문의해 주세요.', color: '#f97316' };
      case 'BATCH_TEMPORARILY_LOCKED':
        return { title: '검증 일시 중단', message: '현재 이 제품군의 검증이 일시 중단되었습니다. 잠시 후 다시 시도해 주세요.', color: '#f97316' };
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
        case 'VALID': return '검증 완료';
        case 'SUSPECT': return '신뢰도 낮음';
        case 'INVALID': return '불일치';
        case 'UNKNOWN': return '인식 실패';
        default: return '확인중';
      }
    };
    const getStatusMessage = () => {
      if (errInfo) return errInfo.message;
      switch (verifyStatus) {
        case 'VALID': return '인증 정보가 확인되었습니다.';
        case 'SUSPECT': return '인식되었으나 신뢰도가 낮습니다. 재촬영해 주세요.';
        case 'INVALID': return '인증 정보와 일치하지 않습니다.';
        case 'UNKNOWN': return '코드를 인식할 수 없습니다. 촬영 조건(조명, 각도, 해상도)을 확인해 주세요.';
        default: return '';
      }
    };
    const handleRetry = useCallback(() => {
      try { setQrDetected(false); setQrData(null); setCapturedImage(null); setRecordInfo(null); setError(null); setProcessing(false); setVerifyStatus(null); setScreen(isCamera ? 'camera' : 'preview'); }
      catch (e) { console.error('retry error:', e); setScreen(isCamera ? 'camera' : 'preview'); }
    }, [isCamera]);
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
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getStatusColor() }} />
              <span style={{ fontSize: '13px', fontWeight: '500', color: getStatusColor() }}>{getStatusText()}</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', marginBottom: '8px', lineHeight: '1.4' }}>{getStatusMessage()}</p>
            {recordInfo && verifyStatus === 'VALID' && (
              <div style={{ paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>Record ID</span><span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px', fontFamily: 'monospace' }}>{recordInfo.recordId.slice(0, 18)}...</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>Pack Hash</span><span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px', fontFamily: 'monospace' }}>{recordInfo.packHash.slice(0, 16)}...</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>검증 시각</span><span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>{new Date(recordInfo.createdAt).toLocaleString('ko-KR')}</span></div>
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
            {(verifyStatus === 'SUSPECT' || verifyStatus === 'UNKNOWN' || verifyStatus === 'INVALID') && (
              <button onClick={handleRetry} style={{ flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', background: verifyStatus === 'SUSPECT' ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.06)', border: `1px solid ${verifyStatus === 'SUSPECT' ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.1)'}`, color: verifyStatus === 'SUSPECT' ? '#fbbf24' : 'white', cursor: 'pointer' }}>다시 촬영</button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const GalleryScreen = () => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { fileInputRef.current?.click(); }, []);
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) { const reader = new FileReader(); reader.onload = (event) => { setPreviewImage(event.target?.result as string); setScanMode('scan'); setScreen('preview'); }; reader.readAsDataURL(file); }
      else { setScreen('home'); }
    };
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
          <button onClick={safeGoHome} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginRight: '16px' }}><BackArrow /></button>
          <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '18px', margin: 0 }}>Gallery</h2>
        </div>
        <div style={{ textAlign: 'center', paddingTop: '80px' }}>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', marginBottom: '8px' }}>사진첩에서 이미지를 선택하세요</p>
          <p style={{ color: 'rgba(251,191,36,0.8)', fontSize: '12px', marginBottom: '24px' }}>캡처/압축된 이미지는 인식이 어려울 수 있습니다.</p>
          <button onClick={() => fileInputRef.current?.click()} style={{ padding: '12px 24px', borderRadius: '12px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: '14px', cursor: 'pointer' }}>이미지 선택</button>
        </div>
      </div>
    );
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
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300' }}>기록 목록</span>
          <div style={{ width: '40px' }} />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>기록은 서버에서 관리됩니다</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {screen === 'home' && <HomeScreen />}
      {screen === 'camera' && <CameraScreen />}
      {screen === 'scan' && <ScanScreen />}
      {screen === 'scanResult' && <ScanResultScreen />}
      {screen === 'result' && <ResultScreen />}
      {screen === 'records' && <RecordsScreen />}
      {screen === 'gallery' && <GalleryScreen />}
      {screen === 'preview' && <PreviewScreen />}
      {screen === 'settings' && <SettingsScreen />}
    </>
  )
}

export default App

































