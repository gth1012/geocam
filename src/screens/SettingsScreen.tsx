import { useTranslation } from 'react-i18next'
import type { SettingsScreenProps } from '../types/app.types'

// UI/UX 리팩 v3.2 (2026-06-28)
// LT-017-1: 뒤로가기 navigateToScreen('mainMenu') 연결
// LT-017-2: 로그아웃 → MainMenuScreen으로 이동 (설정에서 제거)
// LT-017-3: 언어 변경 localStorage 저장

const SettingsScreen = ({ safeGoHome, BackArrow, i18n, onLogout, navigateToScreen }: SettingsScreenProps) => {
  const { t } = useTranslation()
  const currentLang = i18n.language

  const changeLang = (lng: string) => {
    i18n.changeLanguage(lng)
    localStorage.setItem('i18nextLng', lng)
  }

  const handleBack = () => {
    if (navigateToScreen) {
      navigateToScreen('mainMenu')
    } else {
      safeGoHome()
    }
  }

  const langBtn = (lng: string) => ({
    flex: 1,
    padding: '12px',
    borderRadius: '10px',
    background: currentLang === lng ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.03)',
    border: currentLang === lng ? '1px solid rgba(167,139,250,0.35)' : '1px solid rgba(255,255,255,0.08)',
    color: currentLang === lng ? '#a78bfa' : 'rgba(255,255,255,0.5)',
    fontSize: '14px',
    fontWeight: currentLang === lng ? '400' : '300',
    cursor: 'pointer',
  } as const)

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0c',
      padding: '20px',
      paddingTop: 'max(48px, env(safe-area-inset-top))',
      paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
      boxSizing: 'border-box',
    }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
        <button
          onClick={handleBack}
          style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', marginRight: '16px',
          }}
        >
          <BackArrow />
        </button>
        <h2 style={{ color: 'rgba(255,255,255,0.88)', fontSize: '18px', fontWeight: '300', margin: 0, letterSpacing: '0.03em' }}>
          {t('settings.title') || '설정'}
        </h2>
      </div>

      {/* 언어 설정 */}
      <div style={{
        padding: '16px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '14px',
        border: '1px solid rgba(255,255,255,0.06)',
        marginBottom: '12px',
      }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
          {t('settings.language') || 'Language'}
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
          <button onClick={() => changeLang('en')} style={langBtn('en')}>English</button>
          <button onClick={() => changeLang('ko')} style={langBtn('ko')}>한국어</button>
          <button onClick={() => changeLang('ja')} style={langBtn('ja')}>日本語</button>
          <button onClick={() => changeLang('zh')} style={langBtn('zh')}>简体中文</button>
        </div>
      </div>

      {/* 앱 정보 */}
      <div style={{
        padding: '16px',
        background: 'rgba(255,255,255,0.02)',
        borderRadius: '14px',
        border: '1px solid rgba(255,255,255,0.04)',
      }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', fontWeight: '300', margin: '0 0 4px' }}>LegitTag V2.1</p>
        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '11px', fontWeight: '300', margin: 0 }}>Powered by Artion</p>
      </div>
    </div>
  )
}

export default SettingsScreen
