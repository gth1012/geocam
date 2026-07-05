import type { AuthLandingScreenProps } from '../types/app.types'

// Auth UX 리팩 v2.0 (2026-06-22)
// UI/UX 리팩 v3.4 (2026-06-28) — LT-LOGIN-002 액션 버튼 고급화

const AuthLandingScreen = ({ navigateToScreen }: AuthLandingScreenProps) => {

  const handleKakaoStart = () => { navigateToScreen('login') }
  const handleGoogleStart = () => { navigateToScreen('login') }
  const handleNaverStart = () => { navigateToScreen('login') }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '0 32px',
      paddingTop: 'max(48px, env(safe-area-inset-top))',
      paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
      backgroundColor: '#0a0a0c',
      boxSizing: 'border-box',
    }}>

      {/* 상단: 심볼 + 브랜드 텍스트 */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: '40px',
      }}>
        <svg width="85" height="95" viewBox="0 0 180 200" style={{ marginBottom: '20px' }}>
          <defs>
            <radialGradient id="bgGlow2" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#4c1d95" stopOpacity="0.5"/>
              <stop offset="100%" stopColor="#0a0a0c" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="centerGlow2" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"/>
            </radialGradient>
          </defs>
          <ellipse cx="90" cy="95" rx="85" ry="85" fill="url(#bgGlow2)"/>
          <polygon points="90,18 148,51 148,117 90,150 32,117 32,51"
            fill="none" stroke="#3b0764" strokeWidth="16" strokeLinejoin="round"/>
          <polygon points="90,18 148,51 148,117 90,150 32,117 32,51"
            fill="none" stroke="#6d28d9" strokeWidth="8" strokeLinejoin="round" opacity="0.6"/>
          <polygon points="90,18 148,51 148,117 90,150 32,117 32,51"
            fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinejoin="round" opacity="0.95"/>
          <polygon points="90,18 148,51 148,117 90,150 32,117 32,51"
            fill="none" stroke="#e9d5ff" strokeWidth="0.8" strokeLinejoin="round" opacity="0.5"/>
          <circle cx="90" cy="84" r="42" fill="url(#centerGlow2)" opacity="0.35"/>
          <circle cx="90" cy="84" r="24" fill="#2e1065" opacity="0.9"/>
          <circle cx="90" cy="84" r="16" fill="#5b21b6" opacity="0.7"/>
          <circle cx="90" cy="84" r="10" fill="#a78bfa" opacity="0.95"/>
          <circle cx="90" cy="84" r="5"  fill="#ddd6fe"/>
          <circle cx="90" cy="84" r="2.5" fill="#ffffff"/>
        </svg>

        <p style={{
          fontSize: '17px',
          fontWeight: '300',
          letterSpacing: '0.35em',
          color: 'rgba(167,139,250,0.7)',
          margin: '0 0 4px 0',
          textTransform: 'uppercase',
        }}>
          Legit Tag
        </p>
        <p style={{
          fontSize: '9px',
          fontWeight: '300',
          letterSpacing: '0.25em',
          color: 'rgba(124,58,237,0.45)',
          margin: '0',
          textTransform: 'uppercase',
        }}>
          AUTHENTIC GOODS GATEWAY
        </p>
      </div>

      {/* 하단: 액션 영역 */}
      <div style={{
        width: '100%',
        maxWidth: '300px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        paddingBottom: '16px',
      }}>

        {/* 로그인 버튼 — 메인 액션 */}
        <button
          onClick={() => navigateToScreen('login')}
          style={{
            width: '100%',
            padding: '13px',
            borderRadius: '12px',
            background: 'rgba(167,139,250,0.08)',
            border: '1px solid rgba(167,139,250,0.28)',
            color: '#a78bfa',
            fontSize: '14px',
            fontWeight: '300',
            cursor: 'pointer',
            letterSpacing: '0.06em',
          }}
        >
          로그인
        </button>

        {/* 회원가입 텍스트 링크 */}
        <div style={{ textAlign: 'center', padding: '4px 0' }}>
          <span style={{
            color: 'rgba(255,255,255,0.25)',
            fontSize: '12px',
            fontWeight: '300',
            letterSpacing: '0.02em',
          }}>
            아직 계정이 없으신가요?{' '}
          </span>
          <button
            onClick={() => navigateToScreen('register')}
            style={{
              background: 'none',
              border: 'none',
              padding: '0',
              color: 'rgba(251,191,36,0.75)',
              fontSize: '12px',
              fontWeight: '400',
              cursor: 'pointer',
              letterSpacing: '0.02em',
            }}
          >
            회원가입
          </button>
        </div>

        {/* 구분선 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.04)' }} />
          <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: '10px', fontWeight: '300', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
            또는 SNS로 계속하기
          </span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.04)' }} />
        </div>

        {/* SNS 아이콘 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>

          {/* 카카오 */}
          <button
            onClick={handleKakaoStart}
            style={{
              width: '40px', height: '40px', borderRadius: '50%',
              background: 'transparent',
              border: '1px solid rgba(254,229,0,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
            aria-label="카카오로 시작하기"
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.7 1.7 5.1 4.3 6.5l-1.1 4 4.7-3.1c.7.1 1.4.2 2.1.2 5.523 0 10-3.477 10-7.8S17.523 3 12 3z" fill="rgba(254,229,0,0.55)"/>
            </svg>
          </button>

          {/* 구글 */}
          <button
            onClick={handleGoogleStart}
            style={{
              width: '40px', height: '40px', borderRadius: '50%',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              opacity: 0.35,
            }}
            aria-label="구글로 시작하기 (준비중)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </button>

          {/* 네이버 */}
          <button
            onClick={handleNaverStart}
            style={{
              width: '40px', height: '40px', borderRadius: '50%',
              background: 'transparent',
              border: '1px solid rgba(3,199,90,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              opacity: 0.35,
            }}
            aria-label="네이버로 시작하기 (준비중)"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
              <path d="M13.5 10.5L6.2 0H0v20h6.5V9.5L13.8 20H20V0h-6.5v10.5z" fill="rgba(3,199,90,0.6)"/>
            </svg>
          </button>
        </div>
      </div>

      {/* 하단 */}
      <p style={{
        color: 'rgba(255,255,255,0.08)',
        fontSize: '9px',
        letterSpacing: '0.2em',
        fontWeight: '300',
        margin: '0',
      }}>
        Powered by Artion
      </p>
    </div>
  )
}

export default AuthLandingScreen
