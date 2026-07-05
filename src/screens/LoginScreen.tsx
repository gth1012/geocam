import { useState, useEffect } from 'react'
import type { LoginScreenProps } from '../types/app.types'

// Auth UX 리팩 v2.0 (2026-06-22)
// UI/UX 리팩 v3.2 (2026-06-28) — LT-AUTH-001 브랜드 일관성 보정
// v3.3 (2026-06-30) — email/password input name 속성 추가 (Android 자동완성)
// 카카오 로그인: redirect 방식 (2026-06-23 새 앱 1494187 적용)
//
// 보안 기준 (제니팀장 지시 2026-06-22):
// 1. isAuthenticated는 화면 분기용 — 실제 보안은 서버 API 토큰 검증
// 2. 로그인 실패 메시지 통일 — 계정 존재 여부 노출 금지
// 3. 비밀번호 최소 8자
// 4. 카카오 토큰은 서버 검증 후 서버 발급 토큰만 사용
// 5. 콘솔에 토큰 출력 금지
// 6. setScreen 직접 호출 금지 — navigateToScreen 경유

const API_BASE = 'https://neo-api.artionchain.com/api'
const KAKAO_JS_KEY = 'c5f4ee89f72dc32181299a949435e737'
const REDIRECT_URI = 'https://app.artionchain.com'

declare global {
  interface Window { Kakao: any }
}

const LoginScreen = ({ mode, navigateToScreen, onLoginSuccess }: LoginScreenProps) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [snsLoading, setSnsLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (window.Kakao && !window.Kakao.isInitialized()) {
      window.Kakao.init(KAKAO_JS_KEY)
    }
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    if (code && state === 'kakao') {
      setSnsLoading('카카오')
      handleKakaoCallback(code)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleKakaoCallback = async (code: string) => {
    try {
      window.history.replaceState({}, document.title, window.location.pathname)
      const res = await fetch(API_BASE + '/user/auth/kakao/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirect_uri: REDIRECT_URI }),
      })
      const data = await res.json()
      if (!data.success) {
        setError('카카오 로그인에 실패했습니다. 다시 시도해주세요.')
        setSnsLoading(null)
        return
      }
      onLoginSuccess(data.data.token, data.data.user_id, data.data.nickname, data.data.status || 'ACTIVE')
    } catch {
      setError('카카오 로그인 처리 중 오류가 발생했습니다.')
      setSnsLoading(null)
    }
  }

  const handleKakaoLogin = () => {
    if (!window.Kakao || !window.Kakao.isInitialized()) {
      setError('카카오 SDK 초기화에 실패했습니다.')
      return
    }
    window.Kakao.Auth.authorize({ redirectUri: REDIRECT_URI, state: 'kakao' })
  }

  const handleSubmit = async () => {
    if (!email || !password) { setError('이메일과 비밀번호를 입력해주세요.'); return }
    if (password.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return }
    setLoading(true)
    setError(null)
    try {
      const endpoint = mode === 'login' ? '/user/auth/login' : '/user/auth/signup'
      const body: Record<string, string> = { email, password }
      if (mode === 'register' && nickname) body.nickname = nickname
      const res = await fetch(API_BASE + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.success) {
        const safeErrMap: Record<string, string> = {
          INVALID_CREDENTIALS: '이메일 또는 비밀번호를 확인해주세요.',
          USER_NOT_FOUND:      '이메일 또는 비밀번호를 확인해주세요.',
          WRONG_PASSWORD:      '이메일 또는 비밀번호를 확인해주세요.',
          EMAIL_EXISTS:        '이미 가입된 이메일이거나 사용할 수 없는 이메일입니다.',
          WEAK_PASSWORD:       '비밀번호는 8자 이상 영문/숫자 조합을 사용해주세요.',
        }
        setError(safeErrMap[data.error?.code] || '오류가 발생했습니다. 다시 시도해주세요.')
        return
      }
      onLoginSuccess(data.data.token, data.data.user_id, data.data.nickname, data.data.status || 'ACTIVE')
    } catch {
      setError('네트워크 오류가 발생했습니다. 연결을 확인해주세요.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '13px 16px',
    borderRadius: '12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'white',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    WebkitBoxShadow: '0 0 0px 1000px rgba(255,255,255,0.04) inset',
    WebkitTextFillColor: 'white',
  }

  // 카카오 로딩 화면
  if (snsLoading === '카카오') {
    return (
      <div style={{
        minHeight: '100vh', backgroundColor: '#0a0a0c',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '20px',
      }}>
        <div style={{
          width: '48px', height: '48px',
          border: '2px solid rgba(254,229,0,0.2)',
          borderTop: '2px solid rgba(254,229,0,0.6)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', fontWeight: '300' }}>
          로그인 처리 중...
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0a0a0c',
      padding: '0 24px',
      paddingTop: 'max(48px, env(safe-area-inset-top))',
      paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
      boxSizing: 'border-box',
    }}>

      {/* 뒤로가기 */}
      <div style={{ marginBottom: '28px' }}>
        <button
          onClick={() => navigateToScreen('authLanding')}
          style={{
            background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.25)', fontSize: '13px',
            cursor: 'pointer', padding: '0', fontWeight: '300',
          }}
        >
          ← 홈으로
        </button>
      </div>

      {/* 브랜드 블록 — 작은 심볼 + LEGIT TAG */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '60px' }}>
        <svg width="32" height="36" viewBox="0 0 180 200">
          <defs>
            <radialGradient id="bgG" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#4c1d95" stopOpacity="0.6"/>
              <stop offset="100%" stopColor="#0a0a0c" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="cG" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"/>
            </radialGradient>
          </defs>
          <ellipse cx="90" cy="95" rx="85" ry="85" fill="url(#bgG)"/>
          <polygon points="90,18 148,51 148,117 90,150 32,117 32,51"
            fill="none" stroke="#3b0764" strokeWidth="16" strokeLinejoin="round"/>
          <polygon points="90,18 148,51 148,117 90,150 32,117 32,51"
            fill="none" stroke="#6d28d9" strokeWidth="8" strokeLinejoin="round" opacity="0.6"/>
          <polygon points="90,18 148,51 148,117 90,150 32,117 32,51"
            fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinejoin="round" opacity="0.95"/>
          <circle cx="90" cy="84" r="42" fill="url(#cG)" opacity="0.35"/>
          <circle cx="90" cy="84" r="18" fill="#2e1065" opacity="0.9"/>
          <circle cx="90" cy="84" r="11" fill="#a78bfa" opacity="0.95"/>
          <circle cx="90" cy="84" r="5" fill="#ddd6fe"/>
          <circle cx="90" cy="84" r="2.5" fill="#ffffff"/>
        </svg>
        <div>
          <p style={{
            fontSize: '13px', fontWeight: '300',
            letterSpacing: '0.3em', color: 'rgba(167,139,250,0.7)',
            margin: '0 0 2px 0', textTransform: 'uppercase',
          }}>Legit Tag</p>
          <p style={{
            fontSize: '9px', fontWeight: '300',
            letterSpacing: '0.12em', color: 'rgba(124,58,237,0.4)',
            margin: '0', textTransform: 'uppercase',
          }}>Authentic Goods Gateway</p>
        </div>
      </div>

      {/* 제목 */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{
          color: 'rgba(255,255,255,0.85)',
          fontSize: '22px',
          fontWeight: '200',
          letterSpacing: '0.03em',
          marginBottom: '6px',
        }}>
          {mode === 'login' ? '로그인' : '회원가입'}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '12px', fontWeight: '300' }}>
          {mode === 'login'
            ? '내 컬렉션을 관리하고 인증 기록을 확인하세요'
            : '계정을 만들고 정품 인증과 컬렉션 관리를 시작하세요'}
        </p>
      </div>

      {/* 이메일 입력 폼 — 메인 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {mode === 'register' && (
          <input
            type="text"
            name="nickname"
            placeholder="닉네임 선택"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            style={inputStyle}
          />
        )}
        <input
          type="email"
          name="email"
          placeholder="이메일 주소"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={inputStyle}
          autoComplete="email"
        />
        <input
          type="password"
          name="password"
          placeholder={mode === 'login' ? '비밀번호' : '비밀번호 8자 이상'}
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={inputStyle}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      </div>

      {/* 에러 */}
      {error && (
        <p style={{ color: '#f87171', fontSize: '12px', marginBottom: '12px', fontWeight: '300' }}>
          {error}
        </p>
      )}

      {/* 메인 제출 버튼 */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{
          width: '100%', padding: '13px', borderRadius: '12px',
          background: 'rgba(167,139,250,0.08)',
          border: '1px solid rgba(167,139,250,0.28)',
          color: '#a78bfa', fontSize: '14px', fontWeight: '300',
          cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: '14px', letterSpacing: '0.04em',
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? '처리 중...' : mode === 'login' ? '이메일 로그인' : '회원가입 완료'}
      </button>

      {/* 전환 텍스트 링크 */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <span style={{ color: 'rgba(255,255,255,0.22)', fontSize: '12px', fontWeight: '300' }}>
          {mode === 'login' ? '아직 계정이 없으신가요? ' : '이미 계정이 있으신가요? '}
        </span>
        <button
          onClick={() => navigateToScreen(mode === 'login' ? 'register' : 'login')}
          style={{
            background: 'none', border: 'none', padding: '0',
            color: mode === 'login' ? 'rgba(251,191,36,0.75)' : 'rgba(167,139,250,0.75)',
            fontSize: '12px', fontWeight: '400', cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          {mode === 'login' ? '회원가입' : '로그인'}
        </button>
      </div>

      {/* SNS 보조 영역 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.04)' }} />
        <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: '10px', fontWeight: '300', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
          또는 SNS로 계속하기
        </span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.04)' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
        {/* 카카오 */}
        <button
          onClick={handleKakaoLogin}
          style={{
            width: '44px', height: '44px', borderRadius: '50%',
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
          disabled
          style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'not-allowed', opacity: 0.3,
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
          disabled
          style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: 'transparent',
            border: '1px solid rgba(3,199,90,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'not-allowed', opacity: 0.3,
          }}
          aria-label="네이버로 시작하기 (준비중)"
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
            <path d="M13.5 10.5L6.2 0H0v20h6.5V9.5L13.8 20H20V0h-6.5v10.5z" fill="rgba(3,199,90,0.6)"/>
          </svg>
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default LoginScreen
