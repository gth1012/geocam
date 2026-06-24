import { useTranslation } from 'react-i18next'
import type { MainMenuScreenProps } from '../types/app.types'

// Auth UX 리팩 v2.0 (2026-06-22)
// 로그인 완료 사용자 전용 기능 메뉴 화면
// - 기존 HomeScreen의 5개 기능 버튼 이전
// - 로그인 / 회원가입 링크 없음 (MainMenuScreen은 isAuthenticated=true 보장)
// - 모든 화면 이동은 navigateToScreen 경유 (setScreen 직접 호출 없음)

const MainMenuScreen = ({
  safeGoCamera,
  safeGoScan,
  openGalleryPicker,
  BackArrow,
  navigateToScreen,
}: MainMenuScreenProps) => {
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

      {/* ── 설정 아이콘 ── */}
      <button
        onClick={() => navigateToScreen('settings')}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.5)',
          fontSize: '22px',
          cursor: 'pointer',
          padding: '8px',
        }}
        aria-label="설정"
      >
        ⚙
      </button>

      {/* ── 로고 ── */}
      <div style={{ textAlign: 'center', paddingTop: '48px' }}>
        <h1 style={{
          fontSize: '2.25rem',
          fontWeight: '200',
          letterSpacing: '0.15em',
          marginBottom: '0',
          color: 'rgba(255,255,255,0.9)',
        }}>
          Legit Tag
        </h1>
      </div>

      {/* ── 5개 기능 버튼 ── */}
      <div style={{ width: '260px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Digital Verify — accent 버튼 */}
        <button
          onClick={() => navigateToScreen('digitalVerify')}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '16px',
            background: 'rgba(167,139,250,0.12)',
            border: '1px solid rgba(167,139,250,0.35)',
            color: '#a78bfa',
            fontWeight: '400',
            letterSpacing: '0.1em',
            cursor: 'pointer',
            fontSize: '15px',
          }}
        >
          Digital Verify
        </button>

        {/* Camera */}
        <button
          onClick={safeGoCamera}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.9)',
            fontWeight: '300',
            letterSpacing: '0.1em',
            cursor: 'pointer',
            fontSize: '15px',
          }}
        >
          {t('home.cameraButton')}
        </button>

        {/* QR Scan */}
        <button
          onClick={safeGoScan}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.9)',
            fontWeight: '300',
            letterSpacing: '0.1em',
            cursor: 'pointer',
            fontSize: '15px',
          }}
        >
          {t('home.scanButton')}
        </button>

        {/* Gallery */}
        <button
          onClick={openGalleryPicker}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.9)',
            fontWeight: '300',
            letterSpacing: '0.1em',
            cursor: 'pointer',
            fontSize: '15px',
          }}
        >
          {t('home.galleryButton')}
        </button>

        {/* My Collection */}
        <button
          onClick={() => navigateToScreen('myCollection')}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.9)',
            fontWeight: '300',
            letterSpacing: '0.1em',
            cursor: 'pointer',
            fontSize: '15px',
          }}
        >
          {t('home.collectionButton')}
        </button>
      </div>

      {/* ── 하단: Powered by Artion ── */}
      <p style={{
        color: 'rgba(255,255,255,0.2)',
        fontSize: '10px',
        letterSpacing: '0.15em',
        fontWeight: '300',
        margin: '0',
      }}>
        Powered by Artion
      </p>
    </div>
  )
}

export default MainMenuScreen
