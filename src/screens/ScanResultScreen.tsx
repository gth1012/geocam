import type { ScanResultScreenProps } from '../types/app.types'

const ScanResultScreen = ({
  safeGoHome,
  safeGoScan,
  processing,
  scanResultInfo,
  dinaId,
  networkError,
  t,
}: ScanResultScreenProps) => {
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

  // 상태별 설정 (Color → Icon → Text 우선순위)
  const getStatusConfig = () => {
    const status = scanResultInfo.status

    // VALID (Green) - 기록 일치
    if (status === 'CLAIMED') {
      return {
        color: '#4ade80',
        bgColor: 'rgba(74, 222, 128, 0.08)',
        title: t('result.valid'),
        subtitle: t('result.validDescShort'),
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

        {/* 아이콘 (Color 우선) */}
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

      {/* 하단 버튼: 다시 스캔 + 홈 */}
      <div style={{ display: 'flex', gap: '12px', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
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
  )
}

export default ScanResultScreen
