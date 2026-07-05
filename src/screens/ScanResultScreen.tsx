// ScanResultScreen.tsx
// LC-UI-001 (2026-07-05): Unclaimed 한글화 + DINA → artist_name 표시 + 노란색 컬러

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { ScanResultScreenProps } from '../types/app.types'

const NEO_API_BASE = 'https://neo-api.artionchain.com/api/geocam'

const ScanResultScreen = ({
  safeGoHome,
  BackArrow,
  processing,
  scanResultInfo,
  dinaId,
  networkError,
  setScanResultInfo,
  navigateToScreen,
}: ScanResultScreenProps) => {
  const { t } = useTranslation()
  const [claiming, setClaiming] = useState(false)
  const [artistName, setArtistName] = useState<string | null>(null)
  const [seriesName, setSeriesName] = useState<string | null>(null)

  useEffect(() => {
    if (!dinaId) return
    const fetchMeta = async () => {
      try {
        const res = await fetch(`${NEO_API_BASE}/scan/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dina_id: dinaId }),
        })
        if (res.ok) {
          const data = await res.json()
          setArtistName(data.artist_name || null)
          setSeriesName(data.series_name || null)
        }
      } catch {}
    }
    fetchMeta()
  }, [dinaId])

  const handleClaim = async () => {
    if (!dinaId) return
    setClaiming(true)
    try {
      const response = await fetch(`${NEO_API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dina_id: dinaId,
        }),
      })
      const result = await response.json()
      if (response.ok && result.status === 'CLAIMED') {
        setScanResultInfo({ status: 'CLAIMED', message: undefined })
      } else if (result.status === 'CLAIMED') {
        setScanResultInfo({ status: 'ALREADY_CLAIMED', message: undefined })
      } else {
        setScanResultInfo({ status: 'ERROR', message: result.message || result.error })
      }
    } catch {
      setScanResultInfo({ status: 'ERROR', message: t('error.network') })
    } finally {
      setClaiming(false)
    }
  }

  const displayName = artistName || seriesName || dinaId || '-'

  const getStatusConfig = () => {
    const status = scanResultInfo?.status

    if (status === 'UNCLAIMED') {
      return {
        iconColor: '#fbbf24',
        iconBg: 'rgba(251,191,36,0.15)',
        borderColor: 'rgba(251,191,36,0.4)',
        icon: (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="18" stroke="#fbbf24" strokeWidth="2.5" />
            <path d="M24 14v12M24 32h.01" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ),
        title: '최초 인증 대기',
        subtitle: '공식 발행 기록이 확인되었습니다.\n인증하기를 눌러 최초 인증을 완료하세요.',
        titleColor: '#fbbf24',
        showClaim: true,
      }
    }

    if (status === 'CLAIMED') {
      return {
        iconColor: '#4ade80',
        iconBg: 'rgba(74,222,128,0.1)',
        borderColor: 'rgba(74,222,128,0.3)',
        icon: (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="18" stroke="#4ade80" strokeWidth="2.5" />
            <path d="M15 24l6 6 12-12" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        title: '인증완료',
        subtitle: '최초 인증이 완료되었습니다.',
        titleColor: '#4ade80',
        showClaim: false,
      }
    }

    if (status === 'PENDING' || status === 'ALREADY_CLAIMED') {
      return {
        iconColor: '#a78bfa',
        iconBg: 'rgba(167,139,250,0.1)',
        borderColor: 'rgba(167,139,250,0.3)',
        icon: (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="18" stroke="#a78bfa" strokeWidth="2.5" />
            <path d="M15 24l6 6 12-12" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        title: status === 'ALREADY_CLAIMED' ? t('register.alreadyClaimed') : t('register.pending'),
        subtitle: status === 'ALREADY_CLAIMED' ? t('register.alreadyClaimedDesc') : t('register.pendingDesc'),
        titleColor: '#a78bfa',
        showClaim: false,
      }
    }

    if (status === 'ERROR') {
      return {
        iconColor: '#f87171',
        iconBg: 'rgba(248,113,113,0.1)',
        borderColor: 'rgba(248,113,113,0.3)',
        icon: (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="18" stroke="#f87171" strokeWidth="2.5" />
            <path d="M16 16l16 16M32 16L16 32" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ),
        title: t('register.error'),
        subtitle: scanResultInfo?.message || t('register.errorDesc'),
        titleColor: '#f87171',
        showClaim: false,
      }
    }

    // 기본 (로딩 중 or null)
    return {
      iconColor: '#fbbf24',
      iconBg: 'rgba(251,191,36,0.15)',
      borderColor: 'rgba(251,191,36,0.4)',
      icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="18" stroke="#fbbf24" strokeWidth="2.5" />
          <path d="M24 14v14" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
          <circle cx="24" cy="34" r="2" fill="#fbbf24" />
        </svg>
      ),
      title: '최초 인증 대기',
      subtitle: '공식 발행 기록이 확인되었습니다.\n인증하기를 눌러 최초 인증을 완료하세요.',
      titleColor: '#fbbf24',
      showClaim: true,
    }
  }

  const config = getStatusConfig()

  if (processing) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0c', padding: '20px' }}>
        <div style={{ width: '48px', height: '48px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginTop: '16px' }}>확인 중...</p>
      </div>
    )
  }

  if (networkError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0c', padding: '20px', gap: '16px' }}>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="rgba(248,113,113,0.4)" strokeWidth="1.5" />
          <path d="M12 8v5M12 16h.01" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', textAlign: 'center' }}>{t('error.network')}</p>
        <button onClick={safeGoHome} style={{ padding: '12px 24px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: '14px', cursor: 'pointer' }}>
          홈으로
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))', paddingBottom: 'max(40px, env(safe-area-inset-bottom))', boxSizing: 'border-box' }}>

      {/* 상단 뒤로가기 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
        <button onClick={safeGoHome} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
          <BackArrow />
        </button>
      </div>

      {/* 중앙 콘텐츠 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>

        {/* 아이콘 */}
        <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: config.iconBg, border: `2px solid ${config.borderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {config.icon}
        </div>

        {/* 타이틀 */}
        <h1 style={{ color: config.titleColor, fontSize: '28px', fontWeight: '700', margin: 0, textAlign: 'center' }}>
          {config.title}
        </h1>

        {/* 서브타이틀 */}
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', textAlign: 'center', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-line' }}>
          {config.subtitle}
        </p>

        {/* 아티스트명 카드 */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px 32px', textAlign: 'center', minWidth: '200px' }}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', letterSpacing: '0.1em', marginBottom: '6px' }}>
            {artistName ? 'ARTIST' : seriesName ? 'SERIES' : 'DINA'}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '18px', fontWeight: '600', margin: 0 }}>
            {displayName}
          </p>
        </div>

      </div>

      {/* 하단 버튼 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>

        {config.showClaim && (
          <button
            onClick={handleClaim}
            disabled={claiming}
            style={{ width: '100%', padding: '16px', borderRadius: '14px', background: claiming ? 'rgba(167,139,250,0.3)' : '#a78bfa', border: 'none', color: 'white', fontSize: '16px', fontWeight: '600', cursor: claiming ? 'not-allowed' : 'pointer' }}
          >
            {claiming ? '인증 중...' : '인증하기'}
          </button>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => navigateToScreen('scanner')}
            style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: '15px', cursor: 'pointer' }}
          >
            다시 스캔
          </button>
          <button
            onClick={safeGoHome}
            style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: '15px', cursor: 'pointer' }}
          >
            홈
          </button>
        </div>

        <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', textAlign: 'center', marginTop: '4px' }}>
          LegitTag은 공식 발행 기록을 기반으로 검증 정보를 제공합니다.
        </p>

      </div>
    </div>
  )
}

export default ScanResultScreen