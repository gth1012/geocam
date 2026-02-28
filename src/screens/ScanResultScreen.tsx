import type { ScanResultScreenProps } from '../types/app.types'

const ScanResultScreen = ({
  safeGoHome,
  safeGoCamera,
  safeGoScan,
  BackArrow,
  t,
  processing,
  scanResultInfo,
  dinaId,
  networkError,
}: ScanResultScreenProps) => {
  if (processing || !scanResultInfo) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0c', padding: '20px' }}>
        <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(251,191,36,0.1)', border: '2px solid rgba(251,191,36,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '28px' }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
            <circle cx="24" cy="24" r="22" stroke="#fbbf24" strokeWidth="2.5" strokeDasharray="10 5" />
          </svg>
        </div>
        <h2 style={{ color: '#fbbf24', fontSize: '22px', fontWeight: '600', marginBottom: '12px' }}>{t('verify.title')}...</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '15px' }}>{t('verify.subtitle')}</p>
        {dinaId && (
          <div style={{ marginTop: '24px', padding: '14px 20px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginBottom: '4px' }}>DINA 코드</p>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px', fontFamily: 'monospace', letterSpacing: '0.05em', margin: 0 }}>{dinaId}</p>
          </div>
        )}
        <button onClick={safeGoHome} style={{ marginTop: '40px', padding: '14px 28px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: '15px', cursor: 'pointer' }}>{t('verify.cancel')}</button>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const getStatusConfig = () => {
    switch (scanResultInfo.status) {
      case 'PENDING': return {
        color: '#fbbf24',
        text: t('result.pending'),
        icon: (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#fbbf24" strokeWidth="2.5" />
            <path d="M24 14v12" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
            <circle cx="24" cy="33" r="2" fill="#fbbf24" />
          </svg>
        )
      };
      case 'CLAIMED': return {
        color: '#4ade80',
        text: t('result.valid'),
        icon: (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#4ade80" strokeWidth="2.5" />
            <path d="M15 24l6 6 12-12" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )
      };
      case 'ALREADY_CLAIMED': return {
        color: '#f97316',
        text: t('register.alreadyTitle'),
        icon: (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#f97316" strokeWidth="2.5" />
            <path d="M24 14v12" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
            <circle cx="24" cy="33" r="2" fill="#f97316" />
          </svg>
        )
      };
      case 'EXPIRED': return {
        color: '#6b7280',
        text: t('error.session'),
        icon: (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#6b7280" strokeWidth="2.5" />
            <path d="M17 17l14 14M31 17l-14 14" stroke="#6b7280" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )
      };
      case 'ERROR': return {
        color: '#f87171',
        text: t('result.invalid'),
        icon: (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#f87171" strokeWidth="2.5" />
            <path d="M17 17l14 14M31 17l-14 14" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )
      };
      default: return { color: 'rgba(255,255,255,0.6)', text: '', icon: null };
    }
  };

  const config = getStatusConfig();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '40px' }}>
        <button onClick={safeGoHome} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <BackArrow />
        </button>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', marginLeft: '16px', letterSpacing: '0.05em' }}>{t('records.title')}</span>
      </div>

      {/* 결과 영역 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {/* 아이콘 */}
        <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: `${config.color}15`, border: `2px solid ${config.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '28px' }}>
          {config.icon}
        </div>

        {/* 상태 텍스트 */}
        <h2 style={{ color: config.color, fontSize: '22px', fontWeight: '600', marginBottom: '12px', letterSpacing: '0.02em' }}>{config.text}</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '15px', textAlign: 'center', maxWidth: '300px', lineHeight: '1.6' }}>{scanResultInfo?.message}</p>

        {/* DINA 코드 표시 */}
        {dinaId && (
          <div style={{ marginTop: '24px', padding: '14px 20px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginBottom: '4px' }}>DINA 코드</p>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px', fontFamily: 'monospace', letterSpacing: '0.05em', margin: 0 }}>{dinaId}</p>
          </div>
        )}

        {/* 네트워크 에러 시 재시도 */}
        {networkError && (
          <button onClick={safeGoScan} style={{ marginTop: '24px', padding: '14px 28px', borderRadius: '12px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: '15px', cursor: 'pointer' }}>
            {t('common.scanAgain')}
          </button>
        )}
      </div>

      {/* 하단 버튼 */}
      <div style={{ display: 'flex', gap: '12px', paddingBottom: 'max(60px, env(safe-area-inset-bottom))' }}>
        {scanResultInfo?.status === 'PENDING' && (
          <>
            <button onClick={safeGoCamera} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', fontWeight: '500', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', cursor: 'pointer' }}>{t('capture.title')}</button>
            <button onClick={safeGoHome} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>{t('common.close')}</button>
          </>
        )}
        {scanResultInfo?.status === 'CLAIMED' && (
          <button onClick={safeGoHome} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', fontWeight: '500', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', cursor: 'pointer' }}>{t('common.confirm')}</button>
        )}
        {scanResultInfo?.status === 'ALREADY_CLAIMED' && (
          <>
            <button onClick={safeGoHome} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>{t('common.home')}</button>
            <button onClick={() => window.open('mailto:support@artion.com')} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer' }}>{t('common.contact')}</button>
          </>
        )}
        {(scanResultInfo?.status === 'EXPIRED' || scanResultInfo?.status === 'ERROR') && (
          <>
            <button onClick={safeGoScan} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer' }}>{t('common.scanAgain')}</button>
            <button onClick={safeGoHome} style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>{t('common.home')}</button>
          </>
        )}
      </div>
    </div>
  )
}

export default ScanResultScreen
