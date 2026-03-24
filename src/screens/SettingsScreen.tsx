import { useTranslation } from 'react-i18next'
import type { SettingsScreenProps } from '../types/app.types'

const SettingsScreen = ({ safeGoHome, BackArrow, i18n }: SettingsScreenProps) => {
  const { t } = useTranslation()
  const currentLang = i18n.language
  const changeLang = (lng: string) => { i18n.changeLanguage(lng) }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
        <button onClick={safeGoHome} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginRight: '16px' }}>
          <BackArrow />
        </button>
        <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '18px', margin: 0 }}>{t('settings.title')}</h2>
      </div>
      <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', marginBottom: '12px' }}>{t('settings.language')}</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
          <button onClick={() => changeLang('en')} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: currentLang === 'en' ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)', border: currentLang === 'en' ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.08)', color: currentLang === 'en' ? '#4ade80' : 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: currentLang === 'en' ? '500' : '300', cursor: 'pointer' }}>English</button>
          <button onClick={() => changeLang('ko')} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: currentLang === 'ko' ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)', border: currentLang === 'ko' ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.08)', color: currentLang === 'ko' ? '#4ade80' : 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: currentLang === 'ko' ? '500' : '300', cursor: 'pointer' }}>한국어</button>
          <button onClick={() => changeLang('ja')} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: currentLang === 'ja' ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)', border: currentLang === 'ja' ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.08)', color: currentLang === 'ja' ? '#4ade80' : 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: currentLang === 'ja' ? '500' : '300', cursor: 'pointer' }}>日本語</button>
          <button onClick={() => changeLang('zh')} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: currentLang === 'zh' ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)', border: currentLang === 'zh' ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.08)', color: currentLang === 'zh' ? '#4ade80' : 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: currentLang === 'zh' ? '500' : '300', cursor: 'pointer' }}>简体中文</button>
        </div>
      </div>
      <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', margin: 0 }}>LegitTag V2.1</p>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: '4px 0 0 0' }}>Powered by Artion</p>
      </div>
    </div>
  )
}

export default SettingsScreen