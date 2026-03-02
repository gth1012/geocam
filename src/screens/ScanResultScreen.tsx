import { useState } from 'react'
import { API_BASE_URL } from '../api/client'
import type { ScanResultScreenProps } from '../types/app.types'

const ScanResultScreen = ({
  safeGoHome,
  safeGoScan,
  getDeviceFingerprint,
  processing,
  scanResultInfo,
  dinaId,
  networkError,
  setScanResultInfo,
  t,
}: ScanResultScreenProps) => {
  const [claiming, setClaiming] = useState(false)

  // 정품인증 (Claim) 실행 — POST /register (1-Step Bridge)
  const handleClaim = async () => {
    if (!dinaId || claiming) return
    setClaiming(true)

    try {
      console.log('[CLAIM] Register:', `${API_BASE_URL}/geocam/register`, { dina_id: dinaId })

      const response = await fetch(`${API_BASE_URL}/geocam/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dina_id: dinaId,
          signature: 'qr-claim',
          device_info: { fingerprint: getDeviceFingerprint() },
        })
      })

      const result = await response.json()
      console.log('[CLAIM] Response:', result)

      if (response.ok && result.status === 'CLAIMED') {
        // 성공: CLAIMED로 상태 변경
        setScanResultInfo({ status: 'CLAIMED', message: undefined })
      } else if (result.error === 'ALREADY_CLAIMED') {
        setScanResultInfo({ status: 'ALREADY_CLAIMED', message: t('register.alreadyMessage') })
      } else {
        setScanResultInfo({ status: 'ERROR', message: result.message || t('error.claimFailed') })
      }
    } catch (err) {
      console.error('[CLAIM] Error:', err)
      setScanResultInfo({ status: 'ERROR', message: t('error.network') })
    } finally {
      setClaiming(false)
    }
  }

  // 로딩 상태
  if (processing || !scanResultInfo) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0c', padding: '20px' }}>
        <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '32px' }}>
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ animation: 'spin 1.2s linear infinite' }}>
            <circle cx="28" cy="28" r="24" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
            <path d="M28 4 A24 24 0 0 1 52 28" stroke="rgba(255,255,255,0.6)" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '16px', fontWeight: '400' }}>{t('common.checking')}</p>
        {dinaId && (
          <div style={{ marginTop: '32px', padding: '16px 24px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginBottom: '6px', letterSpacing: '0.05em' }}>DINA</p>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '15px', fontFamily: 'monospace', letterSpacing: '0.08em', margin: 0 }}>{dinaId}</p>
          </div>
        )}
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // 상태별 설정
  const getStatusConfig = () => {
    const status = scanResultInfo.status

    // UNCLAIMED (Blue) - 미인증 정품: 정품 등록됨, 고객 인증 전
    if (status === 'UNCLAIMED') {
      return {
        color: '#60a5fa',
        bgColor: 'rgba(96, 165, 250, 0.08)',
        title: t('result.unclaimed'),
        subtitle: t('result.unclaimedDesc'),
        showClaimButton: true,
        icon: (
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="30" stroke="#60a5fa" strokeWidth="2.5" />
            <path d="M32 20v12" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" />
            <path d="M26 32l6 6 6-6" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="32" cy="46" r="2" fill="#60a5fa" />
          </svg>
        )
      }
    }

    // CLAIMED (Green) - 인증완료
    if (status === 'CLAIMED') {
      return {
        color: '#4ade80',
        bgColor: 'rgba(74, 222, 128, 0.08)',
        title: t('result.valid'),
        subtitle: t('result.validDescShort'),
        showClaimButton: false,
        icon: (
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="30" stroke="#4ade80" strokeWidth="2.5" />
            <path d="M20 32l8 8 16-16" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )
      }
    }

    // SUSPECT (Yellow) - 주의 필요
    if (status === 'PENDING' || status === 'ALREADY_CLAIMED') {
      return {
        color: '#fbbf24',
        bgColor: 'rgba(251, 191, 36, 0.08)',
        title: status === 'ALREADY_CLAIMED' ? t('register.alreadyTitle') : t('result.cautionNeeded'),
        subtitle: status === 'ALREADY_CLAIMED'
          ? t('register.alreadyMessage')
          : t('result.cautionNeededDesc'),
        showClaimButton: false,
        icon: (
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="30" stroke="#fbbf24" strokeWidth="2.5" />
            <path d="M32 20v16" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
            <circle cx="32" cy="44" r="2.5" fill="#fbbf24" />
          </svg>
        )
      }
    }

    // INVALID (Red) - 검증 실패
    return {
      color: '#f87171',
      bgColor: 'rgba(248, 113, 113, 0.08)',
      title: networkError ? t('result.networkError') : t('result.verifyFailed'),
      subtitle: networkError
        ? t('result.networkErrorDesc')
        : scanResultInfo.message || t('result.verifyFailedDesc'),
      showClaimButton: false,
      icon: (
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" stroke="#f87171" strokeWidth="2.5" />
          <path d="M22 22l20 20M42 22l-20 20" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    }
  }

  const config = getStatusConfig()

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', padding: '24px', paddingTop: 'max(60px, env(safe-area-inset-top))' }}>

      {/* 메인 결과 영역 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

        {/* 아이콘 */}
        <div style={{
          width: '140px',
          height: '140px',
          borderRadius: '50%',
          background: config.bgColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '32px'
        }}>
          {config.icon}
        </div>

        {/* 상태 텍스트 */}
        <h1 style={{
          color: config.color,
          fontSize: '28px',
          fontWeight: '600',
          marginBottom: '12px',
          letterSpacing: '-0.02em'
        }}>
          {config.title}
        </h1>

        <p style={{
          color: 'rgba(255,255,255,0.5)',
          fontSize: '15px',
          textAlign: 'center',
          maxWidth: '280px',
          lineHeight: '1.6',
          marginBottom: '32px'
        }}>
          {config.subtitle}
        </p>

        {/* DINA 코드 */}
        {dinaId && (
          <div style={{
            padding: '16px 24px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '12px',
            marginBottom: '24px'
          }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginBottom: '6px', letterSpacing: '0.05em' }}>DINA</p>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '15px', fontFamily: 'monospace', letterSpacing: '0.08em', margin: 0 }}>{dinaId}</p>
          </div>
        )}

      </div>

      {/* 면책 문구 */}
      <p style={{
        color: 'rgba(255,255,255,0.3)',
        fontSize: '11px',
        textAlign: 'center',
        lineHeight: '1.5',
        marginBottom: '24px',
        padding: '0 16px'
      }}>
        {t('common.disclaimer')}
      </p>

      {/* 하단 버튼 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
        {config.showClaimButton && (
          <button
            onClick={handleClaim}
            disabled={claiming}
            style={{
              width: '100%',
              padding: '18px',
              borderRadius: '14px',
              fontSize: '18px',
              fontWeight: '600',
              background: claiming ? 'rgba(96, 165, 250, 0.3)' : 'linear-gradient(135deg, #60a5fa, #3b82f6)',
              border: 'none',
              color: '#fff',
              cursor: claiming ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {claiming ? t('claim.processing') : t('claim.button')}
          </button>
        )}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={safeGoScan}
            style={{
              flex: 1,
              padding: '16px',
              borderRadius: '14px',
              fontSize: '16px',
              fontWeight: '500',
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              color: 'rgba(255,255,255,0.9)',
              cursor: 'pointer'
            }}
          >
            {t('common.scanAgain')}
          </button>
          <button
            onClick={safeGoHome}
            style={{
              flex: 1,
              padding: '16px',
              borderRadius: '14px',
              fontSize: '16px',
              fontWeight: '400',
              background: 'rgba(255,255,255,0.03)',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer'
            }}
          >
            {t('common.home')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ScanResultScreen
