import './i18n';
import { useTranslation } from 'react-i18next';
import { useState, useCallback } from 'react'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { runEvidencePipeline } from './evidencePipeline'
import ErrorBoundary from './components/ErrorBoundary'
import {
  HomeScreen,
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
} from './screens'
import type { Screen, ScanMode, RecordInfo, ScanResultInfo, VerifyStatus } from './types/app.types'
import './App.css'

function App() {
  const { t, i18n } = useTranslation();
  const [screen, setScreen] = useState<Screen>('home')
  const [scanMode, setScanMode] = useState<ScanMode>('camera')
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

  // 인증 상태
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [_userNickname, setUserNickname] = useState<string | null>(null)

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

  const onGoCollection = useCallback(() => {
    if (!authToken) {
      setScreen('login');
    } else {
      setScreen('collection');
    }
  }, [authToken]);

  const onLoginSuccess = useCallback((token: string, uid: string, nickname: string) => {
    setAuthToken(token);
    setUserId(uid);
    setUserNickname(nickname);
    setScreen('collection');
  }, []);

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

  const commonProps = { safeGoHome, safeGoCamera, safeGoScan, openGalleryPicker, runPipeline, getDeviceFingerprint, BackArrow, t };

  return (
    <ErrorBoundary>
      {screen === 'home' && <HomeScreen {...commonProps} setScreen={setScreen} />}
      {screen === 'camera' && <CameraScreen {...commonProps} sessionToken={sessionToken} nonce={nonce} dinaId={dinaId} qrData={qrData} setCapturedImage={setCapturedImage} setConfidence={setConfidence} setMatchScore={setMatchScore} setVerifyStatus={setVerifyStatus} setRecordInfo={setRecordInfo} setErrorCode={setErrorCode} setNetworkError={setNetworkError} setProcessing={setProcessing} setScreen={setScreen} cameraError={cameraError} setCameraError={setCameraError} />}
      {screen === 'scan' && <ScanScreen {...commonProps} setQrData={setQrData} setQrDetected={setQrDetected} setProcessing={setProcessing} setNetworkError={setNetworkError} setErrorCode={setErrorCode} setSessionToken={setSessionToken} setNonce={setNonce} setDinaId={setDinaId} setScanResultInfo={setScanResultInfo} setScanMode={setScanMode} setScreen={setScreen} cameraError={cameraError} setCameraError={setCameraError} />}
      {screen === 'scanResult' && <ScanResultScreen {...commonProps} processing={processing} scanResultInfo={scanResultInfo} dinaId={dinaId} networkError={networkError} setScanResultInfo={setScanResultInfo} setScreen={setScreen} />}
      {screen === 'result' && <ResultScreen {...commonProps} scanMode={scanMode} errorCode={errorCode} verifyStatus={verifyStatus} capturedImage={capturedImage} previewImage={previewImage} matchScore={matchScore} confidence={confidence} signatureVerified={signatureVerified} recordInfo={recordInfo} networkError={networkError} sessionToken={sessionToken} dinaId={dinaId} nonce={nonce} registering={registering} setRegistering={setRegistering} setRegisterStatus={setRegisterStatus} setRegisterError={setRegisterError} setScreen={setScreen} setQrDetected={setQrDetected} setQrData={setQrData} setCapturedImage={setCapturedImage} setRecordInfo={setRecordInfo} setError={setError} setProcessing={setProcessing} setVerifyStatus={setVerifyStatus} />}
      {screen === 'records' && <RecordsScreen {...commonProps} />}
      {screen === 'gallery' && <GalleryScreen safeGoHome={safeGoHome} />}
      {screen === 'preview' && <PreviewScreen {...commonProps} previewImage={previewImage} setCapturedImage={setCapturedImage} setScreen={setScreen} />}
      {screen === 'otpInput' && <OtpInputScreen {...commonProps} qrData={qrData} otpInput={otpInput} setOtpInput={setOtpInput} setQrData={setQrData} setScanMode={setScanMode} setQrDetected={setQrDetected} setCapturedImage={setCapturedImage} setRecordInfo={setRecordInfo} setError={setError} setErrorCode={setErrorCode} setProcessing={setProcessing} setNetworkError={setNetworkError} setVerifyStatus={setVerifyStatus} setCameraError={setCameraError} setScreen={setScreen} />}
      {screen === 'registerResult' && <RegisterResultScreen {...commonProps} registerStatus={registerStatus} registerError={registerError} onGoCollection={onGoCollection} />}
      {screen === 'collection' && <CollectionScreen {...commonProps} setScreen={setScreen} authToken={authToken} userId={userId} />}
      {screen === 'login' && <LoginScreen {...commonProps} onLoginSuccess={onLoginSuccess} />}
      {screen === 'settings' && <SettingsScreen {...commonProps} i18n={i18n} />}
    </ErrorBoundary>
  )
}

export default App
