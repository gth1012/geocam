import { displayCopy } from '../verification/display'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { registerWithServer } from '../evidencePipeline'
import type { ResultScreenProps } from '../types/app.types'

// Camera displays the physical verdict; registration/history remain separate.
const ResultScreen = ({
  displayState,
  safeGoHome,
  openGalleryPicker,
  scanMode,
  errorCode,
  verifyStatus,
  capturedImage,
  previewImage,
  matchScore,
  confidence,
  networkError,
  sessionToken,
  dinaId,
  nonce,
  registering,
  setRegistering,
  setRegisterStatus,
  setRegisterError,
  navigateToScreen,
  setQrDetected,
  setQrData,
  setCapturedImage,
  setRecordInfo,
  setError,
  setProcessing,
  setVerifyStatus,
}: ResultScreenProps) => {
  const { t } = useTranslation()
  const isCamera = scanMode === 'camera'
  const displayImage = capturedImage || previewImage

  const baseCopy = displayCopy(displayState)
  const copy = isCamera && displayState.kind === 'result'
    ? displayState.status === 'AUTHENTIC'
      ? { ...baseCopy, title: '정품으로 판정 되었습니다', subtitle: '' }
      : displayState.status === 'PHYSICAL_FAIL'
        ? { ...baseCopy, title: '가품으로 판정 되었습니다', subtitle: '' }
        : displayState.status === 'PHYSICAL_UNREADABLE'
          ? { ...baseCopy, title: '보안코드가 확인되지 않았습니다.', subtitle: '재촬영 후에도 같은 결과가 나오면 본사 정밀판독을 요청해 주세요.' }
          : baseCopy
    : baseCopy
  const color = copy.tone === 'good' ? '#4ade80' : copy.tone === 'warning' ? '#facc15' : copy.tone === 'processing' ? '#a78bfa' : '#f87171'
  const config = { ...copy, color, bgColor: `${color}14`, status: copy.tone,
    icon: <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" stroke={color} strokeWidth="2.5" />
      {copy.tone === 'good' ? <path d="M14 24l7 7 13-13" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : <><path d="M24 14v14" stroke={color} strokeWidth="3" strokeLinecap="round" /><circle cx="24" cy="35" r="2.5" fill={color} /></>}
    </svg> }
  const isProcessing = config.status === 'processing'

  const handleRetry = useCallback(() => {
    setQrDetected(false); setQrData(null); setCapturedImage(null); setRecordInfo(null);
    setError(null); setProcessing(false); setVerifyStatus(null);
    if (isCamera) {
      navigateToScreen('camera')
    } else {
      navigateToScreen('mainMenu')
      setTimeout(() => openGalleryPicker(), 50)
    }
  }, [isCamera, openGalleryPicker, setQrDetected, setQrData, setCapturedImage, setRecordInfo, setError, setProcessing, setVerifyStatus, navigateToScreen])

  const handleRegister = async () => {
    if (!sessionToken || !dinaId || !nonce) return
    setRegistering(true)
    try {
      const res = await registerWithServer(sessionToken, dinaId, nonce)
      setRegisterStatus(res.status)
      if (!res.success) setRegisterError(res.error_code || res.error || 'REGISTRATION_ERROR')
      navigateToScreen('registerResult')
    } catch {
      setRegisterStatus('FAILED')
      setRegisterError('NETWORK_ERROR')
      navigateToScreen('registerResult')
    }
    setRegistering(false)
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', overflow: 'hidden' }}>
      <div style={{ flex: '1', position: 'relative', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' }}>
        {displayImage && (
          <img src={displayImage} alt="captured" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center center' }} />
        )}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '48px', background: 'linear-gradient(to top, #0a0a0c, transparent)' }} />
      </div>
      <div style={{ flex: '0 0 auto', overflowY: 'auto', padding: '12px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: config.bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {isProcessing ? (
              <>
                <svg viewBox="0 0 40 40" style={{ width: '32px', height: '32px', animation: 'spin 1.5s linear infinite' }}>
                  <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(167,139,250,0.2)" strokeWidth="3" />
                  <circle cx="20" cy="20" r="16" fill="none" stroke="#a78bfa" strokeWidth="3" strokeDasharray="40 60" strokeLinecap="round" />
                </svg>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </>
            ) : config.icon}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ color: config.color, fontSize: '18px', fontWeight: '600', marginBottom: '1px', letterSpacing: '-0.02em' }}>{config.title}</h2>
            {config.subtitle && (<p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', lineHeight: '1.2', margin: 0 }}>{config.subtitle}</p>)}
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px' }}>
          {!isCamera && dinaId && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: matchScore !== null || confidence !== null ? '6px' : 0 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>DINA</span>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{dinaId}</span>
            </div>
          )}
          {matchScore !== null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: confidence !== null ? '6px' : 0 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{t('result.matchScore')}</span>
              <span style={{ color: config.color, fontSize: '11px', fontWeight: '600' }}>{(matchScore * 100).toFixed(1)}%</span>
            </div>
          )}
          {confidence !== null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{t('result.confidence')}</span>
              <span style={{ color: config.color, fontSize: '11px', fontWeight: '600' }}>{confidence}%</span>
            </div>
          )}
          {!dinaId && matchScore === null && confidence === null && (
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', textAlign: 'center', margin: 0 }}>{t('result.noInfo')}</p>
          )}
        </div>
        {!isCamera && (<p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px', textAlign: 'center', lineHeight: '1.3', margin: 0 }}>{t('common.disclaimer')}</p>)}
        {displayState.kind === 'result' && displayState.status === 'AUTHENTIC' && sessionToken && scanMode !== 'camera' && (
          <button onClick={handleRegister} disabled={registering} style={{ width: '100%', padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', background: registering ? 'rgba(74,222,128,0.3)' : 'rgba(74,222,128,0.15)', border: 'none', color: '#4ade80', cursor: registering ? 'default' : 'pointer' }}>
            {registering ? t('register.processing') : t('register.button')}
          </button>
        )}
        {!isProcessing && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleRetry} style={{ flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: '500', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.9)', cursor: 'pointer' }}>
              {isCamera ? '다시 촬영' : t('common.retakePhoto')}
            </button>
            <button onClick={safeGoHome} style={{ flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: '400', background: 'rgba(255,255,255,0.03)', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
              {t('common.home')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ResultScreen
