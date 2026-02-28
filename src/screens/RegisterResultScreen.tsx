import type { RegisterResultScreenProps } from '../types/app.types'

const RegisterResultScreen = ({
  safeGoHome,
  t,
  registerStatus,
  registerError,
}: RegisterResultScreenProps) => {
  const getRegisterInfo = () => {
    if (registerStatus === 'ACTIVATED') {
      return {
        color: '#4ade80',
        title: t('register.successTitle'),
        message: t('register.successMessage'),
        icon: (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#4ade80" strokeWidth="2.5" />
            <path d="M15 24l6 6 12-12" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      };
    }
    if (registerStatus === 'ALREADY_ACTIVATED') {
      return {
        color: '#fbbf24',
        title: t('register.alreadyTitle'),
        message: t('register.alreadyMessage'),
        icon: (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#fbbf24" strokeWidth="2.5" />
            <path d="M24 14v12" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
            <circle cx="24" cy="33" r="2" fill="#fbbf24" />
          </svg>
        ),
      };
    }
    const errorMessages: Record<string, string> = {
      SESSION_NOT_VERIFIED: t('error.session'),
      DINA_MISMATCH: t('result.invalid'),
      ASSET_NOT_FOUND: t('result.unknown'),
      BATCH_NOT_SHIPPED: t('error.batch'),
      NETWORK_ERROR: t('error.network'),
    };
    const msg = (registerError && errorMessages[registerError]) || t('error.server');
    return {
      color: '#f87171',
      title: t('result.invalid'),
      message: msg,
      icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" stroke="#f87171" strokeWidth="2.5" />
          <path d="M17 17l14 14M31 17l-14 14" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ),
    };
  };

  const info = getRegisterInfo();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: `${info.color}10`, border: `2px solid ${info.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
          {info.icon}
        </div>
        <h2 style={{ color: info.color, fontSize: '22px', fontWeight: '500', marginBottom: '12px' }}>{info.title}</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', textAlign: 'center', maxWidth: '280px', lineHeight: '1.5' }}>{info.message}</p>
      </div>
      <div style={{ paddingBottom: 'max(60px, env(safe-area-inset-bottom))' }}>
        <button onClick={safeGoHome} style={{ width: '100%', padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>{t('common.home')}</button>
      </div>
    </div>
  );
};

export default RegisterResultScreen
