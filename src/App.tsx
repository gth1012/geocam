import { createRequestGate, parseDisplayResponse, displayError, type DisplayState, type DisplayError } from './verification/display'
import './i18n';
import { useTranslation } from 'react-i18next';
import { useState, useCallback, useEffect, useRef } from 'react'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { runEvidencePipeline } from './evidencePipeline'
import ErrorBoundary from './components/ErrorBoundary'
import {
  AuthLandingScreen,
  MainMenuScreen,
  CertSelectScreen,
  CameraScreen,
  ScanScreen,
  ScanResultScreen,
  ResultScreen,
  GalleryScreen,
  PreviewScreen,
  OtpInputScreen,
  RegisterResultScreen,
  SettingsScreen,
  RecordsScreen,
  CollectionScreen,
  LoginScreen,
  RegisterPendingScreen,
  DigitalVerifyScreen,
  ClaimScreen,
  ClaimBundleScreen,
} from './screens'
import type { Screen, ScanMode, ScanContext, RecordInfo, ScanResultInfo, VerifyStatus } from './types/app.types'
import './App.css'

const PROTECTED_SCREENS: Screen[] = [
  'mainMenu', 'certSelect', 'digitalVerify', 'camera', 'qrScan', 'gallery', 'myCollection',
  'settings', 'scanResult', 'result', 'records', 'preview', 'otpInput',
  'registerResult', 'claim', 'claimBundle',
]

const AUTH_SCREENS: Screen[] = ['authLanding', 'login', 'register']

const GEO_API_BASE = 'https://geo-api.artionchain.com/api'

function App() {
  const { i18n } = useTranslation();
  const [screen, setScreen] = useState<Screen>('authLanding')
  const [scanMode, setScanMode] = useState<ScanMode>('camera')
  const [scanContext, setScanContext] = useState<ScanContext>('claim')
  const [, setQrDetected] = useState(false)
  const [qrData, setQrData] = useState<string | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [previewImage] = useState<string>('')
  const [recordInfo, setRecordInfo] = useState<RecordInfo | null>(null)
  const [scanResultInfo, setScanResultInfo] = useState<ScanResultInfo | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>(null)
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
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [, setUserNickname] = useState<string | null>(null)
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)
  const [welcomeNickname, setWelcomeNickname] = useState<string | null>(null)
  const [claimToken, setClaimToken] = useState<string | null>(null)
  const [bundleClaimToken, setBundleClaimToken] = useState<string | null>(null)
  const [, setLayer2Debug] = useState<any>(null)

  const displayGate = useRef(createRequestGate())
  const [displayState, setDisplayState] = useState<DisplayState>({ kind: 'idle' })
  const isDisplayCurrent = useCallback((id: number) => displayGate.current.current(id), [])
  const cancelDisplay = useCallback(() => {
    displayGate.current.cancel()
    setDisplayState({ kind: 'idle' })
    setProcessing(false)
  }, [])
  const beginDisplay = useCallback(() => {
    const id = displayGate.current.begin()
    setDisplayState({ kind: 'processing' })
    setProcessing(true); setError(null); setErrorCode(null); setNetworkError(false)
    setVerifyStatus(null); setConfidence(null); setMatchScore(null); setRecordInfo(null)
    setSignatureVerified(null)
    return id
  }, [])
  const beginCameraDisplay = useCallback(() => {
    setScanMode('camera')
    return beginDisplay()
  }, [beginDisplay])
  const publishDisplay = useCallback((id: number, state: DisplayState) => {
    if (!displayGate.current.current(id)) return
    setDisplayState(state)
    setProcessing(false)
  }, [])

  const isAuthenticated = Boolean(authToken)

  const navigateToScreen = useCallback((targetScreen: Screen) => {
    if (targetScreen !== 'result' || !authToken) cancelDisplay()
    const authenticated = Boolean(authToken)
    if (PROTECTED_SCREENS.includes(targetScreen) && !authenticated) {
      setScreen('authLanding')
      return
    }
    if (AUTH_SCREENS.includes(targetScreen) && authenticated) {
      setScreen('mainMenu')
      return
    }
    setScreen(targetScreen)
  }, [authToken, cancelDisplay])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    if (code && state === 'kakao') {
      navigateToScreen('login')
      return
    }
    const hash = window.location.hash
    const bundleMatch = hash.match(/^#\/claim\/bundle\/([a-f0-9]+)$/)
    if (bundleMatch && bundleMatch[1]) {
      setBundleClaimToken(bundleMatch[1])
      navigateToScreen('claimBundle')
      return
    }
    const individualMatch = hash.match(/^#\/claim\/([a-f0-9]+)$/)
    if (individualMatch && individualMatch[1]) {
      setClaimToken(individualMatch[1])
      navigateToScreen('claim')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      setSessionToken(null); setNonce(null); setDinaId(null); setSignatureVerified(null);
      setConfidence(null); setMatchScore(null);
      setRegistering(false); setRegisterStatus(null); setRegisterError(null); setOtpInput('');
      setScanContext('claim'); setClaimToken(null); setBundleClaimToken(null);
      navigateToScreen('mainMenu')
    } catch (e) { console.error('safeGoHome error:', e); navigateToScreen('mainMenu') }
  }, [navigateToScreen]);

  const safeGoCamera = useCallback(() => {
    try {
      setScanMode('camera'); setQrDetected(false); setQrData(null); setCapturedImage(null);
      setRecordInfo(null); setError(null); setErrorCode(null); setProcessing(false);
      setNetworkError(false); setVerifyStatus(null); setCameraError(null);
      setSessionToken(null); setNonce(null); setDinaId(null);
      setSignatureVerified(null); setScanResultInfo(null);
      navigateToScreen('camera')
    } catch (e) { console.error('safeGoCamera error:', e); navigateToScreen('camera') }
  }, [navigateToScreen]);

  const safeGoScan = useCallback(() => {
    try {
      setScanMode('scan'); setQrDetected(false); setQrData(null); setCapturedImage(null);
      setRecordInfo(null); setError(null); setProcessing(false); setNetworkError(false);
      setScanResultInfo(null); setScanContext('claim');
      navigateToScreen('qrScan')
    } catch (e) { console.error('safeGoScan error:', e); navigateToScreen('qrScan') }
  }, [navigateToScreen]);

  const onGoCollection = useCallback(() => {
    navigateToScreen('myCollection')
  }, [navigateToScreen]);

  const onLoginSuccess = useCallback((token: string, uid: string, nickname: string, status: string) => {
    setAuthToken(token); setUserId(uid); setUserNickname(nickname);
    if (status === 'REGISTER_PENDING') { setScreen('registerPending'); return }
    if (bundleClaimToken) { setScreen('claimBundle') }
    else if (claimToken) { setScreen('claim') }
    else { setScreen('mainMenu') }
  }, [claimToken, bundleClaimToken]);

  const onProfileComplete = useCallback((nickname: string) => {
    setUserNickname(nickname); setWelcomeNickname(nickname);
    setScreen('mainMenu'); setShowWelcomeModal(true);
  }, []);

  const onLogout = useCallback(async () => {
    cancelDisplay()
    if (authToken) {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 10000)
      try {
        const response = await fetch('https://neo-api.artionchain.com/api/user/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
          signal: controller.signal,
        })
        if (!response.ok && response.status !== 401) throw new Error('Logout unavailable')
      } catch {
        window.alert('로그아웃을 완료하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.')
        return
      } finally {
        window.clearTimeout(timer)
      }
    }
    setAuthToken(null); setUserId(null); setUserNickname(null);
    setScreen('authLanding');
  }, [cancelDisplay, authToken]);

  const runGalleryPhysicalVerify = useCallback(async (imageDataUrl: string, request: number) => {
    if (!isDisplayCurrent(request)) return
    setScanMode('camera'); setCapturedImage(imageDataUrl)
    navigateToScreen('result')
    let failure: DisplayError = 'NETWORK'
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 60000)
    try {
      const res = await fetch('https://neo-api.artionchain.com/api/geocam/physical/detect-signal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_data: imageDataUrl }), signal: controller.signal,
      })
      if (!isDisplayCurrent(request)) return
      if (!res.ok) { publishDisplay(request, displayError('HTTP', res.status)); return }
      failure = 'JSON'
      const result: unknown = await res.json()
      // This endpoint must supply the same final contract; legacy SIGNAL_PRESENT is insufficient.
      publishDisplay(request, parseDisplayResponse(result))
    } catch {
      publishDisplay(request, displayError(controller.signal.aborted ? 'NETWORK' : failure))
    } finally { window.clearTimeout(timer) }
  }, [isDisplayCurrent, publishDisplay, navigateToScreen])

  const openGalleryPicker = useCallback(async () => {
    const request = beginDisplay()
    try {
      const image = await Camera.getPhoto({ quality: 100, allowEditing: false,
        resultType: CameraResultType.Uri, source: CameraSource.Photos })
      if (!isDisplayCurrent(request)) return
      if (!image.webPath) { cancelDisplay(); return }
      setQrDetected(false); setQrData(null); setCapturedImage(null); setCameraError(null)
      const response = await fetch(image.webPath)
      if (!response.ok) throw new Error('IMAGE_READ_FAILED')
      const blob = await response.blob()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('IMAGE_READ_FAILED'))
        reader.onerror = () => reject(new Error('IMAGE_READ_FAILED'))
        reader.onabort = () => reject(new Error('IMAGE_READ_ABORTED'))
        reader.readAsDataURL(blob)
      })
      await runGalleryPhysicalVerify(dataUrl, request)
    } catch (e: unknown) {
      if (!isDisplayCurrent(request)) return
      if (e instanceof Error && /cancel/i.test(e.message)) { cancelDisplay(); return }
      publishDisplay(request, displayError('CAPTURE'))
      navigateToScreen('result')
    }
  }, [beginDisplay, isDisplayCurrent, cancelDisplay, publishDisplay, navigateToScreen, runGalleryPhysicalVerify])

  const runPipeline = async (qrRaw: string | null, imageUri: string) => {
    const request = beginDisplay()
    try {
      const result = await runEvidencePipeline({ qrRaw, imageUri, geoBucket: null, deviceFingerprintHash: getDeviceFingerprint() });
      if (!isDisplayCurrent(request)) return
      publishDisplay(request, result.displayState)
      if (result.error_code) setErrorCode(result.error_code);
      if (result.sessionToken) setSessionToken(result.sessionToken);
      if (result.nonce) setNonce(result.nonce);
      if (result.dinaId) setDinaId(result.dinaId);
      if (result.signatureVerified !== undefined) setSignatureVerified(result.signatureVerified);
      if (result.confidence !== undefined && result.confidence !== null) setConfidence(result.confidence);
      if (result.ok && result.recordId && result.packHash) {
        setRecordInfo({ recordId: result.recordId, packHash: result.packHash, createdAt: new Date().toISOString() });
        setVerifyStatus(result.verify_status || null);
      } else {
        setError(result.error || 'PIPELINE_ERROR');
        setVerifyStatus(result.verify_status || 'INSUFFICIENT_DATA');
      }
      navigateToScreen('result')
    } catch (err) {
      if (!isDisplayCurrent(request)) return
      publishDisplay(request, displayError('PIPELINE'))
      if (err instanceof Error && (err.message.includes('fetch') || err.message.includes('network'))) {
        setNetworkError(true);
      }
      setError(err instanceof Error ? err.message : 'PIPELINE_ERROR');
      setVerifyStatus('INSUFFICIENT_DATA');
      navigateToScreen('result')
    }
    finally { if (isDisplayCurrent(request)) setProcessing(false); }
  }

  const commonProps = { safeGoHome, safeGoCamera, safeGoScan, openGalleryPicker, runPipeline, getDeviceFingerprint, BackArrow , navigateToScreen};

  return (
    <ErrorBoundary>
      {screen === 'authLanding' && (
        <AuthLandingScreen navigateToScreen={navigateToScreen} />
      )}
      {screen === 'login' && (
        <LoginScreen mode="login" navigateToScreen={navigateToScreen} onLoginSuccess={onLoginSuccess} />
      )}
      {screen === 'register' && (
        <LoginScreen mode="register" navigateToScreen={navigateToScreen} onLoginSuccess={onLoginSuccess} />
      )}
      {screen === 'registerPending' && authToken && (
        <RegisterPendingScreen authToken={authToken} onProfileComplete={onProfileComplete} />
      )}

      {isAuthenticated && (
        <>
          {screen === 'mainMenu' && (
            <MainMenuScreen safeGoHome={safeGoHome} safeGoCamera={safeGoCamera} safeGoScan={safeGoScan} openGalleryPicker={openGalleryPicker} BackArrow={BackArrow} navigateToScreen={navigateToScreen} onLogout={onLogout} />
          )}
          {screen === 'certSelect' && (
            <CertSelectScreen safeGoHome={safeGoHome} BackArrow={BackArrow} navigateToScreen={navigateToScreen} openGalleryPicker={openGalleryPicker} />
          )}
          {screen === 'digitalVerify' && (
            <DigitalVerifyScreen authToken={authToken} safeGoHome={safeGoHome} BackArrow={BackArrow} navigateToScreen={navigateToScreen} />
          )}
          {screen === 'claim' && (
            <ClaimScreen safeGoHome={safeGoHome} BackArrow={BackArrow} navigateToScreen={navigateToScreen} claimToken={claimToken} authToken={authToken} userId={userId} />
          )}
          {screen === 'claimBundle' && (
            <ClaimBundleScreen safeGoHome={safeGoHome} BackArrow={BackArrow} navigateToScreen={navigateToScreen} bundleClaimToken={bundleClaimToken} authToken={authToken} userId={userId} />
          )}
          {screen === 'camera' && (
            <CameraScreen {...commonProps} beginDisplay={beginCameraDisplay} isDisplayCurrent={isDisplayCurrent} publishDisplay={publishDisplay} sessionToken={sessionToken} nonce={nonce} dinaId={dinaId} qrData={qrData} setCapturedImage={setCapturedImage} setConfidence={setConfidence} setMatchScore={setMatchScore} setVerifyStatus={setVerifyStatus} setRecordInfo={setRecordInfo} setErrorCode={setErrorCode} setNetworkError={setNetworkError} setProcessing={setProcessing} navigateToScreen={navigateToScreen} cameraError={cameraError} setCameraError={setCameraError} authToken={authToken} />
          )}
          {screen === 'qrScan' && (
            <ScanScreen {...commonProps} setQrData={setQrData} setQrDetected={setQrDetected} setProcessing={setProcessing} setNetworkError={setNetworkError} setErrorCode={setErrorCode} setSessionToken={setSessionToken} setNonce={setNonce} setDinaId={setDinaId} setScanResultInfo={setScanResultInfo} setScanMode={setScanMode} navigateToScreen={navigateToScreen} cameraError={cameraError} setCameraError={setCameraError} scanContext={scanContext} />
          )}
          {screen === 'scanResult' && (
            <ScanResultScreen {...commonProps} processing={processing} scanResultInfo={scanResultInfo} dinaId={dinaId} networkError={networkError} setScanResultInfo={setScanResultInfo} navigateToScreen={navigateToScreen} authToken={authToken} />
          )}
          {screen === 'result' && (
            <ResultScreen {...commonProps} displayState={displayState} scanMode={scanMode} errorCode={errorCode} verifyStatus={verifyStatus} capturedImage={capturedImage} previewImage={previewImage} matchScore={matchScore} confidence={confidence} signatureVerified={signatureVerified} recordInfo={recordInfo} networkError={networkError} sessionToken={sessionToken} dinaId={dinaId} nonce={nonce} registering={registering} setRegistering={setRegistering} setRegisterStatus={setRegisterStatus} setRegisterError={setRegisterError} navigateToScreen={navigateToScreen} setQrDetected={setQrDetected} setQrData={setQrData} setCapturedImage={setCapturedImage} setRecordInfo={setRecordInfo} setError={setError} setProcessing={setProcessing} setVerifyStatus={setVerifyStatus} />
          )}
          {screen === 'records' && <RecordsScreen {...commonProps} />}
          {screen === 'gallery' && <GalleryScreen safeGoHome={safeGoHome} />}
          {screen === 'preview' && (
            <PreviewScreen {...commonProps} previewImage={previewImage} setCapturedImage={setCapturedImage} navigateToScreen={navigateToScreen} />
          )}
          {screen === 'otpInput' && (
            <OtpInputScreen {...commonProps} qrData={qrData} otpInput={otpInput} setOtpInput={setOtpInput} setQrData={setQrData} setScanMode={setScanMode} setQrDetected={setQrDetected} setCapturedImage={setCapturedImage} setRecordInfo={setRecordInfo} setError={setError} setErrorCode={setErrorCode} setProcessing={setProcessing} setNetworkError={setNetworkError} setVerifyStatus={setVerifyStatus} setCameraError={setCameraError} navigateToScreen={navigateToScreen} />
          )}
          {screen === 'registerResult' && (
            <RegisterResultScreen {...commonProps} registerStatus={registerStatus} registerError={registerError} onGoCollection={onGoCollection} />
          )}
          {screen === 'myCollection' && (
            <CollectionScreen safeGoHome={safeGoHome} BackArrow={BackArrow} navigateToScreen={navigateToScreen} authToken={authToken} userId={userId} setDinaId={setDinaId} />
          )}
          {screen === 'settings' && (
            <SettingsScreen {...commonProps} i18n={i18n} onLogout={onLogout} />
          )}
        </>
      )}

      {showWelcomeModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
          <div style={{ width: '100%', maxWidth: '480px', backgroundColor: '#0a0a0c', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '24px 24px 0 0', padding: '32px 28px 28px' }}>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', letterSpacing: '0.15em', fontWeight: '300', marginBottom: '8px' }}>WELCOME</p>
            <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '22px', fontWeight: '200', letterSpacing: '0.05em', marginBottom: '4px' }}>
              {welcomeNickname}님, 환영합니다
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px', fontWeight: '300', marginBottom: '28px' }}>
              LegitTag에 오신 것을 환영합니다.
            </p>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '20px 0', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <span style={{ color: 'rgba(167,139,250,0.8)', fontSize: '13px', marginTop: '1px' }}>✓</span>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: '300' }}>회원가입이 완료되었습니다. 레그캠을 시작하세요.</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowWelcomeModal(false)} style={{ flex: 1, padding: '15px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', fontSize: '14px', fontWeight: '300', cursor: 'pointer', letterSpacing: '0.05em' }}>닫기</button>
              <button onClick={() => { setShowWelcomeModal(false); navigateToScreen('mainMenu') }} style={{ flex: 2, padding: '15px', borderRadius: '16px', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)', color: '#a78bfa', fontSize: '14px', fontWeight: '400', cursor: 'pointer', letterSpacing: '0.05em' }}>시작하기</button>
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  )
}

export default App
