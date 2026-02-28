import type { HomeScreenProps } from '../types/app.types'

const HomeScreen = ({ safeGoScan, safeGoCamera, openGalleryPicker }: HomeScreenProps) => (
  <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 32px', backgroundColor: '#0a0a0c', position: 'relative' }}>
    {/* 헤더 영역 */}
    <div style={{ paddingTop: '120px', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2.25rem', fontWeight: '200', letterSpacing: '0.15em', marginBottom: '8px', color: 'rgba(255,255,255,0.9)' }}>Legit Tag</h1>
    </div>

    {/* 버튼 영역 */}
    <div style={{ marginTop: '120px', width: '260px', position: 'relative', zIndex: 10 }}>
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
          cursor: 'pointer'
        }}
      >
        Camera
      </button>

      <div style={{ height: '50px' }} />

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
          cursor: 'pointer'
        }}
      >
        QR Scan
      </button>

      <div style={{ height: '30px' }} />

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
          cursor: 'pointer'
        }}
      >
        Gallery
      </button>
    </div>

    {/* 하단 영역 */}
    <div style={{ position: 'absolute', bottom: 'max(60px, env(safe-area-inset-bottom))', left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
      {/* 로그인 | 회원가입 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
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
          로그인
        </button>
        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '13px' }}>|</span>
        <button
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
          회원가입
        </button>
      </div>

      {/* Powered by */}
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', letterSpacing: '0.15em', fontWeight: '300' }}>Powered by Artion</p>
    </div>
  </div>
)

export default HomeScreen
