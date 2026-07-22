import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { registerWithServer } from '../evidencePipeline'
import type { ResultScreenProps } from '../types/app.types'

// W3 정정 (P0-5 LT-ENGINE v0.2 § 4 + AUDIT-001 v1.1 § 4 + 빅보스 결정 D2 LOCK):
// - 3-state (PRESENT / ABSENT / INSUFFICIENT_DATA) 단일 LOCK
// Auth UX 리팩 v2.0 (2026-06-22):
// - setScreen('home') → navigateToScreen('mainMenu')
// - setScreen('camera') → navigateToScreen('camera')
// - setScreen('registerResult') → navigateToScreen('registerResult')
// LT-016 (2026-06-23):
// - scanMode === 'camera' (Physical Verify) 결과에서 QR Register 버튼 숨김
// - Physical Verify와 QR Register 세션 충돌 차단
// Layer2 실물 테스트 (2026-06-24):
// - Camera 모드 전용 판정 표시 추가
//   PRESENT           → PHYSICAL VERIFIED (초록)
//   INSUFFICIENT_DATA → RETRY (노란, 재촬영 유도)
//   ABSENT            → INVALID (빨간)
// GCS-AUTO-CAPTURE-001 UI (2026-07-19):
// - verifyStatus === null → "검증 중" 스피너 표시

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

  const getStatusConfig = () => {
    // ── 검증 중 (verifyStatus === null) ──────────────────────────────────
    if (verifyStatus === null) {
      return {
        color: '#a78bfa', bgColor: 'rgba(167, 139, 250, 0.08)',
        title: '검증 중',
        subtitle: '정품 정보를 확인하고 있습니다.',
        status: 'processing',
        icon: null,
      }
    }

    if (networkError) {
      return {
        color: '#f87171', bgColor: 'rgba(248, 113, 113, 0.08)',
        title: t('result.networkError'), subtitle: t('result.networkErrorDesc'),
        status: 'error',
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
        status: 'error',
        icon: (
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#f87171" strokeWidth="2.5" />
            <path d="M16 16l16 16M32 16l-16 16" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )
      }
    }

    // ── Camera 모드 전용 판정 ─────────────────────────────────────────────
    if (isCamera) {
      if (verifyStatus === 'PRESENT') {
        return {
          color: '#4ade80', bgColor: 'rgba(74, 222, 128, 0.08)',
          title: 'PHYSICAL VERIFIED',
          subtitle: 'GeoCode 신호가 확인됐습니다',
          status: 'done',
          icon: (
            <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="#4ade80" strokeWidth="2.5" />
              <path d="M14 24l7 7 13-13" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )
        }
      }
      if (verifyStatus === 'INSUFFICIENT_DATA') {
        return {
          color: '#facc15', bgColor: 'rgba(250, 204, 21, 0.08)',
          title: '재촬영',
          subtitle: '다시 촬영해주세요 — 카드를 평평하게, 조명을 밝게',
          status: 'done',
          icon: (
            <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="#facc15" strokeWidth="2.5" />
              <path d="M24 14v14" stroke="#facc15" strokeWidth="3" strokeLinecap="round" />
              <circle cx="24" cy="35" r="2.5" fill="#facc15" />
            </svg>
          )
        }
      }
      if (verifyStatus === 'ABSENT') {
        return {
          color: '#f87171', bgColor: 'rgba(248, 113, 113, 0.08)',
          title: '인증 불가',
          subtitle: 'GeoCode 신호가 감지되지 않았습니다',
          status: 'done',
          icon: (
            <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="#f87171" strokeWidth="2.5" />
              <path d="M16 16l16 16M32 16l-16 16" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )
        }
      }
    }

    // ── QR 모드 기존 판정 ─────────────────────────────────────────────────
    if (verifyStatus === 'PRESENT') {
      return {
        color: '#4ade80', bgColor: 'rgba(74, 222, 128, 0.08)',
        title: t('result.genuine'), subtitle: t('result.genuineDesc'),
        status: 'done',
        icon: (
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#4ade80" strokeWidth="2.5" />
            <path d="M14 24l7 7 13-13" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )
      }
    }
    if (verifyStatus === 'ABSENT') {
      return {
        color: '#fbbf24', bgColor: 'rgba(251, 191, 36, 0.08)',
        title: t('result.reproduction'), subtitle: t('result.reproductionDesc'),
        status: 'done',
        icon: (
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#fbbf24" strokeWidth="2.5" />
            <path d="M24 14v14" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
            <circle cx="24" cy="35" r="2.5" fill="#fbbf24" />
          </svg>
        )
      }
    }
    if (verifyStatus === 'INSUFFICIENT_DATA') {
      return {
        color: '#f87171', bgColor: 'rgba(248, 113, 113, 0.08)',
        title: t('result.insufficient'), subtitle: t('result.insufficientDesc'),
        status: 'done',
        icon: (
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#f87171" strokeWidth="2.5" />
            <path d="M24 14v14" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
            <circle cx="24" cy="35" r="2.5" fill="#f87171" />
          </svg>
        )
      }
    }
    return {
      color: '#f87171', bgColor: 'rgba(248, 113, 113, 0.08)',
      title: t('result.verifyFailed'), subtitle: t('result.verifyFailedDesc'),
      status: 'error',
      icon: (
        <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" stroke="#f87171" strokeWidth="2.5" />
          <path d="M16 16l16 16M32 16l-16 16" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    }
  }

  const config = getStatusConfig()
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
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', lineHeight: '1.2', margin: 0 }}>{config.subtitle}</p>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px' }}>
          {dinaId && (
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
        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px', textAlign: 'center', lineHeight: '1.3', margin: 0 }}>{t('common.disclaimer')}</p>
        {verifyStatus === 'PRESENT' && sessionToken && scanMode !== 'camera' && (
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
