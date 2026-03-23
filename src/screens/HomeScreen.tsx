import type { HomeScreenProps } from '../types/app.types'

const HomeScreen = ({ safeGoScan, safeGoCamera, openGalleryPicker, t, setScreen }: HomeScreenProps) => (
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
    {/* Settings button */}
    <button
      onClick={() => setScreen('settings')}
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
    >
      ⚙
    </button>

    {/* Logo */}
    <div style={{ textAlign: 'center', paddingTop: '48px' }}>
      <h1 style={{ fontSize: '2.25rem', fontWeight: '200', letterSpacing: '0.15em', marginBottom: '0', color: 'rgba(255,255,255,0.9)' }}>Legit Tag</h1>
    </div>

    {/* Main buttons */}
    <div style={{ width: '260px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
        Camera
      </button>
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
        QR Scan
      </button>
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
        Gallery
      </button>
      <button
        onClick={() => setScreen('collection')}
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
        My Collection
      </button>
    </div>

    {/* Login / Signup */}
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          onClick={() => setScreen('login')}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.6)',
            fontSize: '13px',
            fontWeight: '400',
            cursor: 'pointer',
            padding: '8px',
          }}
        >
          {t('auth.login')}
        </button>
        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '13px' }}>|</span>
        <button
          onClick={() => setScreen('login')}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.6)',
            fontSize: '13px',
            fontWeight: '400',
            cursor: 'pointer',
            padding: '8px',
          }}
        >
          {t('auth.signup')}
        </button>
      </div>
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', letterSpacing: '0.15em', fontWeight: '300', margin: '0' }}>Powered by Artion</p>
    </div>
  </div>
)

export default HomeScreen
