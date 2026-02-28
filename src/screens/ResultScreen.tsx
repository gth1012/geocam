import { useCallback } from 'react'
import { registerWithServer } from '../evidencePipeline'
import type { ResultScreenProps } from '../types/app.types'

const ResultScreen = ({
  safeGoHome,
  openGalleryPicker,
  BackArrow,
  t,
  scanMode,
  errorCode,
  verifyStatus,
  capturedImage,
  previewImage,
  matchScore,
  confidence,
  signatureVerified,
  recordInfo,
  networkError,
  sessionToken,
  dinaId,
  nonce,
  registering,
  setRegistering,
  setRegisterStatus,
  setRegisterError,
  setScreen,
  setQrDetected,
  setQrData,
  setCapturedImage,
  setRecordInfo,
  setError,
  setProcessing,
  setVerifyStatus,
}: ResultScreenProps) => {
  const isCamera = scanMode === 'camera';

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
  }, [isCamera, openGalleryPicker, setQrDetected, setQrData, setCapturedImage, setRecordInfo, setError, setProcessing, setVerifyStatus, setScreen]);

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

export default ResultScreen
