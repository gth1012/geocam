import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { registerWithServer } from '../evidencePipeline'
import type { ResultScreenProps } from '../types/app.types'

const ResultScreen = ({
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
  setScreen,
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

  const getStatusConfig = () => {
    if (networkError) {
      return {
        color: '#f87171', bgColor: 'rgba(248, 113, 113, 0.08)',
        title: t('result.networkError'), subtitle: t('result.networkErrorDesc'),
        icon: (
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#f87171" strokeWidth="2.5" />
            <path d="M16 16l16 16M32 16l-16 16" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )
      }
    }

    if (errorCode) {
      return {
        color: '#f87171', bgColor: 'rgba(248, 113, 113, 0.08)',
        title: t('result.verifyFailed'), subtitle: t('result.verifyFailedDesc'),
        icon: (
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#f87171" strokeWidth="2.5" />
            <path d="M16 16l16 16M32 16l-16 16" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )
      }
    }

    if (verifyStatus === 'VALID') {
      return {
        color: '#4ade80', bgColor: 'rgba(74, 222, 128, 0.08)',
        title: t('result.valid'), subtitle: t('result.validDescShort'),
        icon: (
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#4ade80" strokeWidth="2.5" />
            <path d="M14 24l7 7 13-13" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )
      }
    }

    if (verifyStatus === 'SUSPECT') {
      return {
        color: '#fbbf24', bgColor: 'rgba(251, 191, 36, 0.08)',
        title: t('result.cautionNeeded'), subtitle: t('result.cautionNeededDesc'),
        icon: (
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#fbbf24" strokeWidth="2.5" />
            <path d="M24 14v14" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
            <circle cx="24" cy="35" r="2.5" fill="#fbbf24" />
          </svg>
        )
      }
    }

    return {
      color: '#f87171', bgColor: 'rgba(248, 113, 113, 0.08)',
      title: t('result.verifyFailed'), subtitle: t('result.verifyFailedDesc'),
      icon: (
        <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" stroke="#f87171" strokeWidth="2.5" />
          <path d="M16 16l16 16M32 16l-16 16" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    }
  }

  const config = getStatusConfig()

  const handleRetry = useCallback(() => {
    setQrDetected(false); setQrData(null); setCapturedImage(null); setRecordInfo(null);
    setError(null); setProcessing(false); setVerifyStatus(null);
    if (isCamera) {
      setScreen('camera')
    } else {
      setScreen('home')
      setTimeout(() => openGalleryPicker(), 50)
    }
  }, [isCamera, openGalleryPicker, setQrDetected, setQrData, setCapturedImage, setRecordInfo, setError, setProcessing, setVerifyStatus, setScreen])

  const handleRegister = async () => {
    if (!sessionToken || !dinaId || !nonce) return
    setRegistering(true)
    try {
      const res = await registerWithServer(sessionToken, dinaId, nonce)
      setRegisterStatus(res.status)
      if (!res.success) setRegisterError(res.error_code || res.error || 'UNKNOWN')
      setScreen('registerResult')
    } catch (e) {
      setRegisterStatus('FAILED')
      setRegisterError('NETWORK_ERROR')
      setScreen('registerResult')
    }
    setRegistering(false)
  }

  return (
<<<<<<< HEAD
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', overflow: 'hidden' }}>

      {/* 상단: 촬영 이미지 — 55vh 고정, 세로 중앙 정렬 */}
      <div style={{
        height: '55vh',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#111'
      }}>
        {displayImage && (
          <img
            src={displayImage}
            alt="captured"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center center'
            }}
          />
        )}
        {/* 하단 그라데이션 오버레이 */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '48px',
          background: 'linear-gradient(to top, #0a0a0c, transparent)'
        }} />
      </div>

      {/* 하단: 결과 패널 — 나머지 공간 채움 */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>

        {/* 상태 표시 */}
=======
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c' }}>
      <div style={{ maxHeight: '65vh', position: 'relative', overflow: 'hidden' }}>
        {displayImage && (
          <img src={displayImage} alt="captured" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', background: 'linear-gradient(to top, #0a0a0c, transparent)' }} />
      </div>

      <div style={{ minHeight: '35vh', padding: '12px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: '8px' }}>
>>>>>>> a89aaf6ae737c3d3d5c8312640e94e9673a92b4f
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: config.bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {config.icon}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ color: config.color, fontSize: '18px', fontWeight: '600', marginBottom: '1px', letterSpacing: '-0.02em' }}>
              {config.title}
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', lineHeight: '1.2', margin: 0 }}>
              {config.subtitle}
            </p>
          </div>
        </div>

<<<<<<< HEAD
        {/* 상세 정보 */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '8px',
          padding: '10px'
        }}>
=======
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px' }}>
>>>>>>> a89aaf6ae737c3d3d5c8312640e94e9673a92b4f
          {dinaId && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: matchScore !== null || confidence !== null ? '6px' : 0 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>DINA</span>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{dinaId}</span>
            </div>
          )}
<<<<<<< HEAD

=======
>>>>>>> a89aaf6ae737c3d3d5c8312640e94e9673a92b4f
          {matchScore !== null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: confidence !== null ? '6px' : 0 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{t('result.matchScore')}</span>
              <span style={{ color: config.color, fontSize: '11px', fontWeight: '600' }}>{(matchScore * 100).toFixed(1)}%</span>
            </div>
          )}
<<<<<<< HEAD

=======
>>>>>>> a89aaf6ae737c3d3d5c8312640e94e9673a92b4f
          {confidence !== null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{t('result.confidence')}</span>
              <span style={{ color: config.color, fontSize: '11px', fontWeight: '600' }}>{confidence}%</span>
            </div>
          )}
<<<<<<< HEAD

=======
>>>>>>> a89aaf6ae737c3d3d5c8312640e94e9673a92b4f
          {!dinaId && matchScore === null && confidence === null && (
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', textAlign: 'center', margin: 0 }}>{t('result.noInfo')}</p>
          )}
        </div>

        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px', textAlign: 'center', lineHeight: '1.3', margin: 0 }}>
          {t('common.disclaimer')}
        </p>

        {verifyStatus === 'VALID' && sessionToken && (
          <button
            onClick={handleRegister}
            disabled={registering}
            style={{ width: '100%', padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', background: registering ? 'rgba(74,222,128,0.3)' : 'rgba(74,222,128,0.15)', border: 'none', color: '#4ade80', cursor: registering ? 'default' : 'pointer' }}
          >
            {registering ? t('register.processing') : t('register.button')}
          </button>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleRetry} style={{ flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: '500', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.9)', cursor: 'pointer' }}>
            {t('common.retakePhoto')}
          </button>
          <button onClick={safeGoHome} style={{ flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: '400', background: 'rgba(255,255,255,0.03)', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
            {t('common.home')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ResultScreen