import { useTranslation } from 'react-i18next'
import type { HomeScreenProps } from '../types/app.types'

// Auth UX 리팩 v2.0 (2026-06-22)
// HomeScreen은 더 이상 사용되지 않습니다.
// 역할: AuthLandingScreen (비로그인) + MainMenuScreen (로그인 후) 으로 분리됨
// 이 파일은 컴파일 오류 방지용으로 유지 (미사용)
// 구형 screen 값 제거: 'collection' → 'myCollection'

const HomeScreen = ({ safeGoHome, safeGoCamera, safeGoScan, openGalleryPicker, BackArrow, setScreen }: HomeScreenProps) => {
  const { t } = useTranslation()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0 32px',
      paddingTop: 'max(48px, env(safe-area-inset-top))',
      paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
      backgroundColor: '#0a0a0c',
      position: 'relative',
      boxSizing: 'border-box',
    }}>
      <button onClick={() => setScreen('settings')} style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '22px', cursor: 'pointer', padding: '8px' }}>⚙</button>
      <div style={{ textAlign: 'center', paddingTop: '48px' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: '200', letterSpacing: '0.15em', marginBottom: '0', color: 'rgba(255,255,255,0.9)' }}>Legit Tag</h1>
      </div>
      <div style={{ width: '260px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <button onClick={() => setScreen('digitalVerify')} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.35)', color: '#a78bfa', fontWeight: '400', letterSpacing: '0.1em', cursor: 'pointer', fontSize: '15px' }}>
          Digital Verify
        </button>
        <button onClick={safeGoCamera} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.9)', fontWeight: '300', letterSpacing: '0.1em', cursor: 'pointer', fontSize: '15px' }}>
          {t('home.cameraButton')}
        </button>
        <button onClick={safeGoScan} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.9)', fontWeight: '300', letterSpacing: '0.1em', cursor: 'pointer', fontSize: '15px' }}>
          {t('home.scanButton')}
        </button>
        <button onClick={openGalleryPicker} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.9)', fontWeight: '300', letterSpacing: '0.1em', cursor: 'pointer', fontSize: '15px' }}>
          {t('home.galleryButton')}
        </button>
        <button onClick={() => setScreen('myCollection')} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.9)', fontWeight: '300', letterSpacing: '0.1em', cursor: 'pointer', fontSize: '15px' }}>
          {t('home.collectionButton')}
        </button>
      </div>
      <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '10px', letterSpacing: '0.15em', fontWeight: '300', margin: '0' }}>Powered by Artion</p>
    </div>
  )
}

export default HomeScreen
