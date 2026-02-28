import type { HomeScreenProps } from '../types/app.types'

const HomeScreen = ({ safeGoScan, openGalleryPicker }: HomeScreenProps) => (
  <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 32px', backgroundColor: '#0a0a0c', position: 'relative' }}>
    {/* 헤더 영역 */}
    <div style={{ paddingTop: '140px', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: '600', letterSpacing: '-0.02em', marginBottom: '12px', color: 'rgba(255,255,255,0.95)' }}>LegitTag</h1>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', letterSpacing: '0.15em', fontWeight: '300' }}>스캔. 확인. 검증.</p>
    </div>

    {/* 메인 버튼 영역 */}
    <div style={{ marginTop: '80px', width: '280px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* 스캔하기 버튼 */}
      <button
        onClick={safeGoScan}
        style={{
          width: '100%',
          padding: '18px 32px',
          borderRadius: '14px',
          background: 'rgba(255,255,255,0.95)',
          border: 'none',
          color: '#0a0a0c',
          fontSize: '17px',
          fontWeight: '600',
          letterSpacing: '-0.01em',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        스캔하기
      </button>

      {/* 갤러리 텍스트 링크 */}
      <button
        onClick={openGalleryPicker}
        style={{
          marginTop: '24px',
          background: 'transparent',
          border: 'none',
          color: 'rgba(255,255,255,0.5)',
          fontSize: '14px',
          fontWeight: '400',
          cursor: 'pointer',
          padding: '8px 16px',
          letterSpacing: '0.02em',
        }}
      >
        갤러리
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
