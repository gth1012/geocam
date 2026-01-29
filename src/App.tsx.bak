import { useState, useRef, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { Scanner } from '@yudiel/react-qr-scanner'
import { runEvidencePipeline } from './evidencePipeline'
import { validateChain, getChain } from './appendOnlyStore'
import { scanStart, verify, register } from './api'
import type { VerifyResponse } from './api'
import './App.css'

type Screen = 'home' | 'camera' | 'scan' | 'result' | 'records'
type ScanMode = 'camera' | 'scan'

interface RecordInfo {
  recordId: string;
  packHash: string;
  createdAt: string;
}

interface SessionInfo {
  sessionToken: string;
  nonce: string;
  dinaId: string;
  expiresAt: number;
  assetStatus: 'SHIPPED' | 'ACTIVATED' | 'UNKNOWN';
}

function getDeviceFingerprint(): string {
  const nav = navigator;
  const scr = window.screen;
  const raw = [nav.userAgent, nav.language, scr.width, scr.height, scr.colorDepth, new Date().getTimezoneOffset()].join('|');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) { hash = ((hash << 5) - hash) + raw.charCodeAt(i); hash |= 0; }
  return 'DFP-' + Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
}

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [scanMode, setScanMode] = useState<ScanMode>('camera')
  const [qrDetected, setQrDetected] = useState(false)
  const [qrData, setQrData] = useState<string | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [recordInfo, setRecordInfo] = useState<RecordInfo | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [records, setRecords] = useState<any[]>([])
  const [showFlash, setShowFlash] = useState(false)
  
  // API 세션 상태
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [sessionTimer, setSessionTimer] = useState<number>(0)
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  
  const webcamRef = useRef<Webcam>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 온라인/오프라인 감지
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // 세션 타이머
  useEffect(() => {
    if (session && session.expiresAt > Date.now()) {
      timerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000))
        setSessionTimer(remaining)
        if (remaining <= 0) {
          setSession(null)
          setApiError('세션이 만료되었습니다. QR을 다시 스캔해주세요.')
          if (timerRef.current) clearInterval(timerRef.current)
        }
      }, 1000)
      return () => { if (timerRef.current) clearInterval(timerRef.current) }
    }
  }, [session])

  // QR 스캔 후 API 세션 시작
  const startApiSession = async (qrPayload: string) => {
    if (!isOnline) {
      setApiError('오프라인 상태입니다. 네트워크 연결을 확인해주세요.')
      return false
    }
    try {
      setApiError(null)
      const response = await scanStart(qrPayload)
      if (response.success) {
        const dinaId = qrPayload.startsWith('DINA-') ? qrPayload : 'DINA-' + qrPayload
        setSession({
          sessionToken: response.session_token,
          nonce: response.nonce,
          dinaId: dinaId,
          expiresAt: Date.now() + (response.ttl_seconds * 1000),
          assetStatus: response.asset_status
        })
        setSessionTimer(response.ttl_seconds)
        return true
      } else {
        setApiError(response.error || 'API 세션 시작 실패')
        return false
      }
    } catch (err) {
      console.error('API 세션 시작 에러:', err)
      setApiError(err instanceof Error ? err.message : 'API 연결 실패')
      return false
    }
  }

  // 서버 검증 요청
  const requestVerify = async (imageData: string, clientConfidence?: number): Promise<VerifyResponse | null> => {
    if (!session) {
      setApiError('세션이 없습니다. QR을 다시 스캔해주세요.')
      return null
    }
    if (!isOnline) {
      setApiError('오프라인 상태입니다.')
      return null
    }
    try {
      setApiError(null)
      const response = await verify(session.sessionToken, session.nonce, imageData, clientConfidence)
      setVerifyResult(response)
      return response
    } catch (err) {
      console.error('검증 요청 에러:', err)
      setApiError(err instanceof Error ? err.message : '검증 실패')
      return null
    }
  }

  // 최초 등록 요청
  const requestRegister = async (): Promise<boolean> => {
    if (!session || !verifyResult) {
      setApiError('세션 또는 검증 결과가 없습니다.')
      return false
    }
    try {
      setApiError(null)
      const response = await register(session.sessionToken, session.nonce, session.dinaId, verifyResult.confidence)
      if (response.success && response.status === 'ACTIVATED') {
        return true
      } else if (response.status === 'ALREADY_ACTIVATED') {
        setApiError('이미 등록된 굿즈입니다.')
        return false
      } else {
        setApiError(response.error || '등록 실패')
        return false
      }
    } catch (err) {
      console.error('등록 요청 에러:', err)
      setApiError(err instanceof Error ? err.message : '등록 실패')
      return false
    }
  }

  // 통합 파이프라인 (로컬 + API)
  const runPipeline = async (qrRaw: string | null, imageUri: string) => {
    setProcessing(true)
    setError(null)
    setApiError(null)
    try {
      const result = await runEvidencePipeline({
        qrRaw,
        imageUri,
        geoBucket: null,
        deviceFingerprintHash: getDeviceFingerprint()
      })
      console.log('파이프라인 결과:', result)
      
      if (result.ok && result.recordId && result.packHash) {
        setRecordInfo({
          recordId: result.recordId,
          packHash: result.packHash,
          createdAt: new Date().toISOString()
        })
        await validateChain()
        
        if (isOnline && session && imageUri !== 'scan-mode-no-image') {
          const verifyRes = await requestVerify(imageUri, undefined)
          if (verifyRes) {
            console.log('서버 검증 결과:', verifyRes)
          }
        }
        
        setScreen('result')
      } else {
        setError(result.error || 'UNKNOWN_ERROR')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIPELINE_ERROR')
    } finally {
      setProcessing(false)
    }
  }

  const capturePhoto = useCallback(async () => {
    try { 
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 800
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.5, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)
      osc.start()
      osc.stop(ctx.currentTime + 0.15)
    } catch(e) {}
    
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot()
      if (imageSrc) {
        setCapturedImage(imageSrc)
        setShowFlash(true)
        setTimeout(() => setShowFlash(false), 150)
        await runPipeline(qrData || null, imageSrc)
      }
    }
  }, [qrData, session, isOnline])

  const handleCameraQrScan = async (result: any) => {
    if (result && result[0]?.rawValue && !qrDetected) {
      const data = result[0].rawValue
      if (data.includes('DINA-')) {
        setQrData(data)
        setQrDetected(true)
        await startApiSession(data)
      }
    }
  }

  const handleScanQrScan = async (result: any) => {
    if (result && result[0]?.rawValue) {
      const data = result[0].rawValue
      setQrData(data)
      await startApiSession(data)
      await runPipeline(data, 'scan-mode-no-image')
    }
  }

  const HomeScreen = () => (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 32px', backgroundColor: '#0a0a0c' }}>
      <div style={{ paddingTop: '120px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: '200', letterSpacing: '0.25em', marginBottom: '12px', color: 'rgba(255,255,255,0.9)' }}>Geo Cam</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', letterSpacing: '0.2em' }}>정품 인증 서비스</p>
        {!isOnline && <p style={{ color: '#F2C94C', fontSize: '11px', marginTop: '8px' }}> 오프라인 모드</p>}
      </div>
      <div style={{ marginTop: '100px', width: '260px' }}>
        <button onClick={() => { setScanMode('camera'); setQrDetected(false); setQrData(null); setCapturedImage(null); setRecordInfo(null); setError(null); setApiError(null); setSession(null); setVerifyResult(null); setScreen('camera'); }} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', fontWeight: '300', letterSpacing: '0.1em', cursor: 'pointer' }}>Camera</button>
        <div style={{ height: '50px' }} />
        <button onClick={() => { setScanMode('scan'); setQrData(null); setRecordInfo(null); setError(null); setApiError(null); setSession(null); setVerifyResult(null); setScreen('scan'); }} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', fontWeight: '300', letterSpacing: '0.1em', cursor: 'pointer' }}>Scan</button>
        <div style={{ height: '30px' }} />
        <button onClick={() => { const chain = getChain(); setRecords(chain); setScreen('records'); }} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer' }}>Records</button>
      </div>
      <p style={{ position: 'fixed', bottom: '40px', color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>v2.0.0  API Connected</p>
    </div>
  )

  const SessionTimerBar = () => {
    if (!session) return null
    const percentage = (sessionTimer / 180) * 100
    const isLow = sessionTimer < 30
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }}>
        <div style={{ height: '3px', background: 'rgba(255,255,255,0.1)' }}>
          <div style={{ height: '100%', width: percentage + '%', background: isLow ? '#EB5757' : '#2F80ED', transition: 'width 1s linear' }} />
        </div>
        <div style={{ position: 'absolute', top: '8px', right: '12px', fontSize: '11px', color: isLow ? '#EB5757' : 'rgba(255,255,255,0.6)' }}>
          {Math.floor(sessionTimer / 60)}:{(sessionTimer % 60).toString().padStart(2, '0')}
        </div>
      </div>
    )
  }

  const CameraScreen = () => (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0c', position: 'relative' }}>
      <SessionTimerBar />
      {showFlash && <div style={{ position: 'fixed', inset: 0, backgroundColor: 'white', zIndex: 999 }} />}
      <div style={{ position: 'relative', width: '100%', height: '70vh' }}>
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          videoConstraints={{ facingMode: 'environment', width: 1280, height: 720 }}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <Scanner
          onScan={handleCameraQrScan}
          allowMultiple={false}
          scanDelay={500}
          components={{ torch: false, finder: false }}
          styles={{ container: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0 } }}
        />
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '200px', height: '200px', border: '2px solid rgba(255,255,255,0.3)', borderRadius: '16px' }} />
        {qrDetected && (
          <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(47,128,237,0.9)', padding: '8px 16px', borderRadius: '20px', fontSize: '12px', color: 'white' }}>
             QR 인식됨 {session && <span style={{ opacity: 0.8 }}> 세션 활성</span>}
          </div>
        )}
        {apiError && (
          <div style={{ position: 'absolute', top: qrDetected ? '60px' : '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(235,87,87,0.9)', padding: '8px 16px', borderRadius: '20px', fontSize: '11px', color: 'white', maxWidth: '80%', textAlign: 'center' }}>
            {apiError}
          </div>
        )}
      </div>
      <div style={{ padding: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <button onClick={capturePhoto} disabled={processing} style={{ width: '72px', height: '72px', borderRadius: '50%', background: processing ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.9)', border: 'none', cursor: processing ? 'not-allowed' : 'pointer' }}>
          {processing ? <span style={{ fontSize: '24px' }}></span> : <div style={{ width: '56px', height: '56px', borderRadius: '50%', border: '3px solid #0a0a0c', margin: '5px' }} />}
        </button>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
          {processing ? '처리 중...' : qrDetected ? '촬영 버튼을 눌러주세요' : 'QR 코드를 화면에 맞춰주세요'}
        </p>
        <button onClick={() => setScreen('home')} style={{ marginTop: '10px', padding: '10px 24px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: 'rgba(255,255,255,0.6)', fontSize: '13px', cursor: 'pointer' }}>취소</button>
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )

  const ScanScreen = () => (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0c', display: 'flex', flexDirection: 'column' }}>
      <SessionTimerBar />
      <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => setScreen('home')} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '14px', cursor: 'pointer' }}> 뒤로</button>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>Scan Mode</span>
        {!isOnline && <span style={{ color: '#F2C94C', fontSize: '11px' }}>오프라인</span>}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ width: '280px', height: '280px', position: 'relative', borderRadius: '20px', overflow: 'hidden' }}>
          <Scanner
            onScan={handleScanQrScan}
            allowMultiple={false}
            scanDelay={500}
            styles={{ container: { width: '100%', height: '100%' }, video: { objectFit: 'cover' } }}
          />
        </div>
        {apiError && <p style={{ marginTop: '16px', color: '#EB5757', fontSize: '12px', textAlign: 'center' }}>{apiError}</p>}
        {processing && <p style={{ marginTop: '16px', color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>처리 중...</p>}
        <p style={{ marginTop: '24px', color: 'rgba(255,255,255,0.4)', fontSize: '12px', textAlign: 'center' }}>QR 코드를 스캔하면<br/>자동으로 검증합니다</p>
      </div>
    </div>
  )

  const ResultScreen = () => {
    const [registering, setRegistering] = useState(false)
    const [registered, setRegistered] = useState(false)
    
    const handleRegister = async () => {
      setRegistering(true)
      const success = await requestRegister()
      if (success) {
        setRegistered(true)
      }
      setRegistering(false)
    }
    
    const getStatusColor = () => {
      if (!verifyResult) return '#E0E0E0'
      if (verifyResult.result === 'VALID') return '#27AE60'
      if (verifyResult.result === 'UNCERTAIN') return '#F2C94C'
      return '#EB5757'
    }
    
    const getStatusText = () => {
      if (registered) return '등록 완료'
      if (!verifyResult) return '로컬 검증 완료'
      if (verifyResult.result === 'VALID') return '정품 확인됨'
      if (verifyResult.result === 'UNCERTAIN') return '재촬영 필요'
      return '위조 의심'
    }
    
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0c', padding: '40px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: getStatusColor(), margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '36px', color: 'white' }}>{registered ? '' : verifyResult?.result === 'VALID' ? '' : verifyResult?.result === 'UNCERTAIN' ? '?' : '!'}</span>
          </div>
          <h2 style={{ color: 'white', fontSize: '24px', fontWeight: '300', marginBottom: '8px' }}>{getStatusText()}</h2>
          {verifyResult && <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>신뢰도: {verifyResult.confidence}%</p>}
        </div>
        
        {qrData && (
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginBottom: '4px' }}>DINA ID</p>
            <p style={{ color: 'white', fontSize: '14px', fontFamily: 'monospace' }}>{qrData}</p>
          </div>
        )}
        
        {recordInfo && (
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginBottom: '4px' }}>Record ID</p>
            <p style={{ color: 'white', fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{recordInfo.recordId}</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '12px', marginBottom: '4px' }}>Pack Hash</p>
            <p style={{ color: 'white', fontSize: '10px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{recordInfo.packHash}</p>
          </div>
        )}
        
        {session && session.assetStatus === 'SHIPPED' && verifyResult?.result === 'VALID' && !registered && (
          <button onClick={handleRegister} disabled={registering} style={{ width: '100%', padding: '16px', borderRadius: '12px', background: registering ? 'rgba(39,174,96,0.5)' : '#27AE60', border: 'none', color: 'white', fontSize: '16px', fontWeight: '500', cursor: registering ? 'not-allowed' : 'pointer', marginBottom: '12px' }}>
            {registering ? '등록 중...' : ' 최초 등록하기'}
          </button>
        )}
        
        {verifyResult?.result === 'UNCERTAIN' && verifyResult.retry_allowed && (
          <button onClick={() => { setVerifyResult(null); setScreen('camera'); }} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: '#F2C94C', border: 'none', color: '#0a0a0c', fontSize: '14px', fontWeight: '500', cursor: 'pointer', marginBottom: '12px' }}>
             다시 촬영하기 ({verifyResult.remaining_attempts}회 남음)
          </button>
        )}
        
        {apiError && <p style={{ color: '#EB5757', fontSize: '12px', textAlign: 'center', marginBottom: '12px' }}>{apiError}</p>}
        {error && <p style={{ color: '#EB5757', fontSize: '12px', textAlign: 'center', marginBottom: '12px' }}>{error}</p>}
        
        <button onClick={() => setScreen('home')} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', fontSize: '14px', cursor: 'pointer' }}>홈으로</button>
      </div>
    )
  }

  const RecordsScreen = () => (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0c', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <button onClick={() => setScreen('home')} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '14px', cursor: 'pointer' }}> 뒤로</button>
        <span style={{ color: 'white', fontSize: '16px' }}>Records</span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{records.length}개</span>
      </div>
      {records.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: '100px' }}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>저장된 기록이 없습니다</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {records.map((record, index) => (
            <div key={index} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: 'white', fontSize: '13px' }}>#{records.length - index}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{new Date(record.createdAt).toLocaleString()}</span>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{record.recordId?.substring(0, 40)}...</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // @ts-ignore
  const _unused = [scanMode, capturedImage]

  return (
    <>
      {screen === 'home' && <HomeScreen />}
      {screen === 'camera' && <CameraScreen />}
      {screen === 'scan' && <ScanScreen />}
      {screen === 'result' && <ResultScreen />}
      {screen === 'records' && <RecordsScreen />}
    </>
  )
}

export default App
