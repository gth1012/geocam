import { useState, useRef, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { Scanner } from '@yudiel/react-qr-scanner'
import { runEvidencePipeline } from './evidencePipeline'
import { validateChain, getChain } from './appendOnlyStore'
import './App.css'

type Screen = 'home' | 'camera' | 'scan' | 'result' | 'records' | 'gallery' | 'preview' | 'settings'
type ScanMode = 'camera' | 'scan'

interface RecordInfo {
  recordId: string;
  packHash: string;
  createdAt: string;
}

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [scanMode, setScanMode] = useState<ScanMode>('camera')
  const [qrDetected, setQrDetected] = useState(false)
  const [qrData, setQrData] = useState<string | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string>('')
  const [recordInfo, setRecordInfo] = useState<RecordInfo | null>(null)
  const [chainValid, setChainValid] = useState<boolean>(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  const runPipeline = async (qrRaw: string, imageUri: string) => {
    setProcessing(true);
    setError(null);
    try {
      const result = await runEvidencePipeline({
        qrRaw,
        imageUri,
        geoBucket: null,
        deviceFingerprintHash: getDeviceFingerprint()
      });
      console.log(' 파이프라인 결과:', result);
        if (result.ok && result.recordId && result.packHash) {
        setRecordInfo({
          recordId: result.recordId,
          packHash: result.packHash,
          createdAt: new Date().toISOString()
        });
        const chainResult = await validateChain();
        setChainValid(chainResult.ok);
        setScreen('result');
      } else {
        setError(result.error || 'UNKNOWN_ERROR');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIPELINE_ERROR');
    } finally {
      setProcessing(false);
    }
  }

  const capturePhoto = useCallback(async () => {
    console.log(' capturePhoto 호출됨');
      // 찰칵 소리
      const audio = new Audio('data:audio/wav;base64,UklGRl9vT19teleXRhdmVmbXQgAAAAEACABBAAgAQAEBBGRhdGFv');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    if (webcamRef.current) {
      console.log(' webcamRef 있음');
      const imageSrc = webcamRef.current.getScreenshot();
      console.log(' 스크린샷:', imageSrc ? '성공' : '실패');
      if (imageSrc) {
        setCapturedImage(imageSrc);
        console.log(' 파이프라인 실행 시작');
        if (qrData) {
            await runPipeline(qrData, imageSrc);
          } else {
            // QR 없이 촬영만 - 테스트용 결과 표시
            setRecordInfo({
              recordId: 'TEST-' + Date.now(),
              packHash: 'test-hash-' + Date.now(),
              createdAt: new Date().toISOString()
            });
            setChainValid(true);
            setScreen('result');
          }
        console.log(' 파이프라인 완료');
      }
    } else {
      console.log(' webcamRef 없음!');
    }
  }, [qrData])

  const handleCameraQrScan = (result: any) => {
    if (result && result[0]?.rawValue && !qrDetected) {
      const data = result[0].rawValue;
      if (data.includes('DINA-')) {
        setQrData(data);
        setQrDetected(true);
      }
    }
  }

  const handleScanQrScan = async (result: any) => {
    if (result && result[0]?.rawValue) {
      const data = result[0].rawValue;
      setQrData(data);
      await runPipeline(data, 'scan-mode-no-image');
    }
  }

  const HomeScreen = () => (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 32px', backgroundColor: '#0a0a0c' }}>
      <div style={{ paddingTop: '120px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: '200', letterSpacing: '0.25em', marginBottom: '12px', color: 'rgba(255,255,255,0.9)' }}>Geo Cam</h1>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', letterSpacing: '0.2em' }}>정품 인증 서비스</p>
      </div>
      <div style={{ marginTop: '100px', width: '260px' }}>
        <button onClick={() => { setScanMode('camera'); setQrDetected(false); setQrData(null); setCapturedImage(null); setRecordInfo(null); setError(null); setScreen('camera'); }} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', fontWeight: '300', letterSpacing: '0.1em', cursor: 'pointer' }}>Camera</button>
        <div style={{ height: '50px' }} />
        <button onClick={() => { setScanMode('scan'); setQrData(null); setRecordInfo(null); setError(null); setScreen('scan'); }} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', fontWeight: '300', letterSpacing: '0.1em', cursor: 'pointer' }}>Scan</button>
        <div style={{ height: '30px' }} />
        <button onClick={() => setScreen('gallery')} style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)', fontWeight: '300', letterSpacing: '0.1em', fontSize: '14px', cursor: 'pointer' }}>Gallery</button>
      </div>
      <div style={{ position: 'absolute', bottom: '40px', textAlign: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '10px', letterSpacing: '0.2em' }}>Powered by Artion</p>
      </div>
    </div>
  )

  const CameraScreen = () => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => setScreen('home')} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><BackArrow /></button>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', letterSpacing: '0.1em' }}>촬영</span>
        <div style={{ width: '40px' }} />
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        {/* Webcam 항상 표시 */}
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          videoConstraints={{ facingMode: 'environment', width: 1280, height: 720 }}
          style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }}
        />
        
        {/* QR Scanner 오버레이 (투명하게 동시 동작) */}
        {!qrDetected && (
          <div style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none' }}>
            <Scanner
              onScan={handleCameraQrScan}
              constraints={{ facingMode: 'environment' }}
              styles={{ container: { width: '100%', height: '100%' }, video: { width: '100%', height: '100%', objectFit: 'cover' } }}
            />
          </div>
        )}

        {/* 스캔 프레임 가이드 */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '200px', height: '200px', zIndex: 10 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '40px', height: '40px', borderTop: `3px solid ${qrDetected ? '#4ade80' : 'rgba(255,255,255,0.6)'}`, borderLeft: `3px solid ${qrDetected ? '#4ade80' : 'rgba(255,255,255,0.6)'}`, borderTopLeftRadius: '12px' }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: '40px', height: '40px', borderTop: `3px solid ${qrDetected ? '#4ade80' : 'rgba(255,255,255,0.6)'}`, borderRight: `3px solid ${qrDetected ? '#4ade80' : 'rgba(255,255,255,0.6)'}`, borderTopRightRadius: '12px' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '40px', height: '40px', borderBottom: `3px solid ${qrDetected ? '#4ade80' : 'rgba(255,255,255,0.6)'}`, borderLeft: `3px solid ${qrDetected ? '#4ade80' : 'rgba(255,255,255,0.6)'}`, borderBottomLeftRadius: '12px' }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: '40px', height: '40px', borderBottom: `3px solid ${qrDetected ? '#4ade80' : 'rgba(255,255,255,0.6)'}`, borderRight: `3px solid ${qrDetected ? '#4ade80' : 'rgba(255,255,255,0.6)'}`, borderBottomRightRadius: '12px' }} />
          {qrDetected && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '8px 16px', background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)', borderRadius: '8px' }}>
              <span style={{ color: '#4ade80', fontSize: '12px' }}>QR 인식됨</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '24px', paddingBottom: '48px', textAlign: 'center', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', position: 'relative', zIndex: 10 }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '20px' }}>
          {processing ? '처리 중...' : qrDetected ? 'QR 인식됨 - 촬영하세요' : '촬영 버튼을 누르세요 (QR 자동인식)'}
        </p>
        <button onClick={capturePhoto} disabled={processing} style={{ width: '72px', height: '72px', borderRadius: '50%', background: !processing ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)', border: '4px solid rgba(255,255,255,0.3)', cursor: !processing ? 'pointer' : 'not-allowed' }} />
      </div>
    </div>
  )

  const ScanScreen = () => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => setScreen('home')} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><BackArrow /></button>
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

      <div style={{ padding: '24px', paddingBottom: '48px', textAlign: 'center', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', position: 'relative', zIndex: 10 }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>{processing ? '처리 중...' : 'QR 코드를 화면에 맞춰주세요'}</p>
      </div>
    </div>
  )

  const ResultScreen = () => {
    const isCamera = scanMode === 'camera';
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c' }}>
        <div style={{ flex: '0.35', position: 'relative', background: 'rgba(0,0,0,0.3)' }}>
          {capturedImage && <img src={capturedImage} alt="captured" style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} />}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '96px', background: 'linear-gradient(to top, #0a0a0c, transparent)' }} />
          <button onClick={() => setScreen('home')} style={{ position: 'absolute', top: '16px', left: '16px', width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><BackArrow /></button>
          <div style={{ position: 'absolute', top: '20px', right: '16px', padding: '6px 14px', borderRadius: '9999px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{isCamera ? '실물 촬영' : '참고 스캔'}</div>
        </div>
        <div style={{ flex: '0.55', padding: '0 16px', marginTop: '16px', position: 'relative', zIndex: 10 }}>
          <div style={{ background: chainValid ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${chainValid ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius: '20px', padding: '24px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '9999px', background: chainValid ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${chainValid ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, marginBottom: '16px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: chainValid ? '#4ade80' : '#f87171' }} />
              <span style={{ fontSize: '13px', fontWeight: '500', color: chainValid ? '#4ade80' : '#f87171' }}>{chainValid ? '검증되었습니다' : '검증 실패'}</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '24px' }}>{isCamera ? '증거가 생성되어 로컬에 저장되었습니다.' : '참고용 기록이 생성되었습니다.'}</p>
            {recordInfo && (
              <div style={{ paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}><span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>Record ID</span><span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px', fontFamily: 'monospace' }}>{recordInfo.recordId.slice(0, 18)}...</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}><span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>Pack Hash</span><span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px', fontFamily: 'monospace' }}>{recordInfo.packHash.slice(0, 16)}...</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>생성 시각</span><span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>{new Date(recordInfo.createdAt).toLocaleString('ko-KR')}</span></div>
              </div>
            )}
            {error && <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px' }}><span style={{ color: '#f87171', fontSize: '12px' }}>{error}</span></div>}
          </div>
          <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
            <button onClick={() => setScreen('home')} style={{ flex: 1, padding: '14px', borderRadius: '14px', fontSize: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>홈으로</button>
            <button onClick={() => { setQrDetected(false); setQrData(null); setCapturedImage(null); setRecordInfo(null); setError(null); setScreen(isCamera ? 'camera' : 'scan'); }} style={{ flex: 1, padding: '14px', borderRadius: '14px', fontSize: '14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer' }}>{isCamera ? '다시 촬영' : '다시 스캔'}</button>
          </div>
        </div>
      </div>
    )
  }

    // Gallery Screen - 이미지 목록
  const GalleryScreen = () => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
      fileInputRef.current?.click();
    }, []);
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const imageData = event.target?.result as string;
          setPreviewImage(imageData);
          setScreen('preview');
        };
        reader.readAsDataURL(file);
      } else {
        setScreen('home');
      }
    };
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0c', padding: '20px' }}>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
          <button onClick={() => setScreen('home')} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginRight: '16px' }}><BackArrow /></button>
          <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '18px', margin: 0 }}>Gallery</h2>
          <div style={{ marginLeft: 'auto' }}><button onClick={() => setScreen('settings')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px' }}><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '20px' }}></span></button></div>
        </div>
        <div style={{ textAlign: 'center', paddingTop: '100px' }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '20px' }}>사진첩에서 이미지를 선택하세요</p>
          <button onClick={() => fileInputRef.current?.click()} style={{ padding: '12px 24px', borderRadius: '12px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: '14px', cursor: 'pointer' }}>이미지 선택</button>
        </div>
      </div>
    );
  };

  // Preview Screen - 미리보기 + 검증하기 버튼
  const PreviewScreen = () => {
    const [verifying, setVerifying] = useState(false);
    const handleVerify = async () => {
      setVerifying(true);
      if (previewImage) {
        await runPipeline('GALLERY-VERIFY', previewImage);
      }
      setVerifying(false);
    };
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0c', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px', display: 'flex', alignItems: 'center' }}>
          <button onClick={() => setScreen('gallery')} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><BackArrow /></button>
          <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '18px', margin: 0, marginLeft: '16px' }}>미리보기</h2>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <img src={previewImage} alt="" style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: '12px' }} />
        </div>
        <div style={{ padding: '20px' }}>
          <button onClick={handleVerify} disabled={verifying} style={{ width: '100%', padding: '16px', borderRadius: '12px', background: verifying ? 'rgba(74,222,128,0.3)' : 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: '16px', fontWeight: '500', cursor: verifying ? 'default' : 'pointer' }}>{verifying ? '검증 중...' : '검증하기'}</button>
        </div>
      </div>
    );
  };

  // Settings Screen - 설정 (기록 접근)
  const SettingsScreen = () => {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0c', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
          <button onClick={() => setScreen('gallery')} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginRight: '16px' }}><BackArrow /></button>
          <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '18px', margin: 0 }}>설정</h2>
        </div>
        <div style={{ marginTop: '20px' }}>
          <button onClick={() => setScreen('records')} style={{ width: '100%', padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', fontSize: '14px', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>검증 기록</span><span style={{ color: 'rgba(255,255,255,0.3)' }}></span></button>
        </div>
        <div style={{ marginTop: '40px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', margin: 0 }}>GeoCam V2.0</p>
          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', margin: '4px 0 0 0' }}>Powered by Artion</p>
        </div>
      </div>
    );
  };

  const RecordsScreen = () => {
    const [records, setRecords] = useState<any[]>([]);
    const [isValid, setIsValid] = useState(true);
    useEffect(() => { const chain = getChain(); setRecords(chain); validateChain().then(result => setIsValid(result.ok)); }, []);
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={() => setScreen('home')} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><BackArrow /></button>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300' }}>기록 목록</span>
          <div style={{ width: '40px', display: 'flex', justifyContent: 'center' }}><div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isValid ? '#4ade80' : '#f87171' }} /></div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {records.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '100px' }}><p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>기록이 없습니다</p></div>
          ) : (
            records.map((record, index) => (
              <div key={record.recordId} style={{ marginBottom: '12px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>#{index + 1}</span><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{new Date(record.createdAt).toLocaleString('ko-KR')}</span></div>
                <div style={{ marginBottom: '4px' }}><span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px' }}>ID: </span><span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', fontFamily: 'monospace' }}>{record.recordId.slice(0, 24)}...</span></div>
                <div><span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px' }}>Hash: </span><span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', fontFamily: 'monospace' }}>{record.packHash.slice(0, 20)}...</span></div>
              </div>
            ))
          )}
        </div>
        {!isValid && <div style={{ padding: '16px', background: 'rgba(239,68,68,0.1)', borderTop: '1px solid rgba(239,68,68,0.2)' }}><p style={{ color: '#f87171', fontSize: '12px', textAlign: 'center' }}>체인 무결성 오류 감지</p></div>}
      </div>
    )
  }

  return (
    <>
      {screen === 'home' && <HomeScreen />}
      {screen === 'camera' && <CameraScreen />}
      {screen === 'scan' && <ScanScreen />}
      {screen === 'result' && <ResultScreen />}
      {screen === 'records' && <RecordsScreen />}
      {screen === 'gallery' && <GalleryScreen />}
      {screen === 'preview' && <PreviewScreen />}
      {screen === 'settings' && <SettingsScreen />}
    </>
  )
}

export default App























