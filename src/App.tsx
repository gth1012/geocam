import './i18n';
import { useTranslation } from 'react-i18next';
import { useState, useCallback, useEffect } from 'react'
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
const TEST_CANDIDATE = 'C'
const TEST_DINA_ID = 'TEST-DINA-LAYER2-001'

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

  const isAuthenticated = Boolean(authToken)

  const navigateToScreen = useCallback((targetScreen: Screen) => {
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
  }, [authToken])

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

  const onLogout = useCallback(() => {
    setAuthToken(null); setUserId(null); setUserNickname(null);
    setScreen('authLanding');
  }, []);

  const runGalleryPhysicalVerify = useCallback(async (imageDataUrl: string) => {
    await new Promise(resolve => setTimeout(resolve, 300))
    setProcessing(true)
    setScanMode('camera')
    setCapturedImage(imageDataUrl)
    try {
      const NEO_API = 'https://neo-api.artionchain.com/api/geocam'
      const res = await fetch(`${NEO_API}/physical/detect-signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_data: imageDataUrl }),
      })
      const result = await res.json()
      if (result.verdict === 'SIGNAL_PRESENT') {
        setVerifyStatus('PRESENT')
      } else if (result.verdict === 'SIGNAL_UNCERTAIN') {
        setVerifyStatus('INSUFFICIENT_DATA')
      } else {
        setVerifyStatus('ABSENT')
      }
    } catch (e) {
      console.error('[GalleryVerify] error:', e)
      setNetworkError(true)
      setVerifyStatus('INSUFFICIENT_DATA')
    }
    setProcessing(false)
    navigateToScreen('result')
  }, [navigateToScreen])

  const openGalleryPicker = useCallback(async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 100, allowEditing: false,
        resultType: CameraResultType.Uri, source: CameraSource.Photos
      })
      if (image.webPath) {
        setQrDetected(false); setQrData(null); setCapturedImage(null);
        setRecordInfo(null); setError(null); setProcessing(false);
        setNetworkError(false); setVerifyStatus(null); setCameraError(null);
        const response = await fetch(image.webPath)
        const blob = await response.blob()
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          runGalleryPhysicalVerify(dataUrl)
        }
        reader.readAsDataURL(blob)
      }
    } catch (e: any) {
      console.error('[GalleryPicker] error:', e)
      if (e?.message?.includes('cancel') || e?.message?.includes('Cancel')) return
    }
  }, [runGalleryPhysicalVerify]);

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
      if (result.ok && result.recordId && result.packHash) {
        setRecordInfo({ recordId: result.recordId, packHash: result.packHash, createdAt: new Date().toISOString() });
        setVerifyStatus(result.verify_status || 'PRESENT');
      } else {
        setError(result.error || 'PIPELINE_ERROR');
        setVerifyStatus(result.verify_status || 'INSUFFICIENT_DATA');
      }
      navigateToScreen('result')
    } catch (err) {
      if (err instanceof Error && (err.message.includes('fetch') || err.message.includes('network'))) {
        setNetworkError(true);
      }
      setError(err instanceof Error ? err.message : 'PIPELINE_ERROR');
      setVerifyStatus('INSUFFICIENT_DATA');
      navigateToScreen('result')
    }
    finally { setProcessing(false); }
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
            <DigitalVerifyScreen safeGoHome={safeGoHome} BackArrow={BackArrow} navigateToScreen={navigateToScreen} />
          )}
          {screen === 'claim' && (
            <ClaimScreen safeGoHome={safeGoHome} BackArrow={BackArrow} navigateToScreen={navigateToScreen} claimToken={claimToken} authToken={authToken} userId={userId} />
          )}
          {screen === 'claimBundle' && (
            <ClaimBundleScreen safeGoHome={safeGoHome} BackArrow={BackArrow} navigateToScreen={navigateToScreen} bundleClaimToken={bundleClaimToken} authToken={authToken} userId={userId} />
          )}
          {screen === 'camera' && (
            <CameraScreen {...commonProps} sessionToken={sessionToken} nonce={nonce} dinaId={dinaId} qrData={qrData} setCapturedImage={setCapturedImage} setConfidence={setConfidence} setMatchScore={setMatchScore} setVerifyStatus={setVerifyStatus} setRecordInfo={setRecordInfo} setErrorCode={setErrorCode} setNetworkError={setNetworkError} setProcessing={setProcessing} navigateToScreen={navigateToScreen} cameraError={cameraError} setCameraError={setCameraError} authToken={authToken} />
          )}
          {screen === 'qrScan' && (
            <ScanScreen {...commonProps} setQrData={setQrData} setQrDetected={setQrDetected} setProcessing={setProcessing} setNetworkError={setNetworkError} setErrorCode={setErrorCode} setSessionToken={setSessionToken} setNonce={setNonce} setDinaId={setDinaId} setScanResultInfo={setScanResultInfo} setScanMode={setScanMode} navigateToScreen={navigateToScreen} cameraError={cameraError} setCameraError={setCameraError} scanContext={scanContext} />
          )}
          {screen === 'scanResult' && (
            <ScanResultScreen {...commonProps} processing={processing} scanResultInfo={scanResultInfo} dinaId={dinaId} networkError={networkError} setScanResultInfo={setScanResultInfo} navigateToScreen={navigateToScreen} authToken={authToken} />
          )}
          {screen === 'result' && (
            <ResultScreen {...commonProps} scanMode={scanMode} errorCode={errorCode} verifyStatus={verifyStatus} capturedImage={capturedImage} previewImage={previewImage} matchScore={matchScore} confidence={confidence} signatureVerified={signatureVerified} recordInfo={recordInfo} networkError={networkError} sessionToken={sessionToken} dinaId={dinaId} nonce={nonce} registering={registering} setRegistering={setRegistering} setRegisterStatus={setRegisterStatus} setRegisterError={setRegisterError} navigateToScreen={navigateToScreen} setQrDetected={setQrDetected} setQrData={setQrData} setCapturedImage={setCapturedImage} setRecordInfo={setRecordInfo} setError={setError} setProcessing={setProcessing} setVerifyStatus={setVerifyStatus} />
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
