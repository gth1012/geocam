import { useState, useEffect } from 'react'
import type { LoginScreenProps } from '../types/app.types'

// Auth UX 리팩 v2.0 (2026-06-22)
// 로그인 / 회원가입 공용 컴포넌트 (Screen 상태는 App.tsx에서 분리)
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

  // ─────────────────────────────────────────────
  // 카카오 SDK 초기화 + 리다이렉트 콜백 처리
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // 카카오 인가 코드 → 서버 토큰 교환
  // 보안: 서버가 카카오 토큰 검증 후 서버 자체 accessToken 발급
  // 클라이언트는 서버 발급 토큰만 사용
  // ─────────────────────────────────────────────
  const handleKakaoCallback = async (code: string) => {
    try {
      // URL 정리 (code 파라미터 제거 — 재사용 방지)
      window.history.replaceState({}, document.title, window.location.pathname)

      const res = await fetch(API_BASE + '/user/auth/kakao/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirect_uri: REDIRECT_URI }),
      })
      const data = await res.json()

      if (!data.success) {
        // 보안: 카카오 실패 원인 상세 노출 금지
        setError('카카오 로그인에 실패했습니다. 다시 시도해주세요.')
        setSnsLoading(null)
        return
      }

      // 서버 발급 토큰만 사용 (콘솔 출력 금지)
      onLoginSuccess(
        data.data.token,
        data.data.user_id,
        data.data.nickname,
        data.data.status || 'ACTIVE'
      )
    } catch {
      setError('카카오 로그인 처리 중 오류가 발생했습니다.')
      setSnsLoading(null)
    }
  }

  // ─────────────────────────────────────────────
  // 카카오 리다이렉트 방식
  // ─────────────────────────────────────────────
  const handleKakaoLogin = () => {
    if (!window.Kakao || !window.Kakao.isInitialized()) {
      setError('카카오 SDK 초기화에 실패했습니다.')
      return
    }
    window.Kakao.Auth.authorize({
      redirectUri: REDIRECT_URI,
      state: 'kakao',
    })
  }

  // ─────────────────────────────────────────────
  // 이메일 로그인 / 회원가입
  // ─────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력해주세요.')
      return
    }

    // 비밀번호 최소 8자 (보안 기준)
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.')
      return
    }

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
        // 보안: 에러 메시지 통일 — 계정 존재 여부 노출 금지
        const safeErrMap: Record<string, string> = {
          // 로그인 실패 — 계정 존재 여부 구분 금지
          INVALID_CREDENTIALS: '이메일 또는 비밀번호를 확인해주세요.',
          USER_NOT_FOUND:      '이메일 또는 비밀번호를 확인해주세요.',
          WRONG_PASSWORD:      '이메일 또는 비밀번호를 확인해주세요.',
          // 회원가입 — 중복 이메일 (UX상 안내 허용, 완화 표현 사용)
          EMAIL_EXISTS:        '이미 가입된 이메일이거나 사용할 수 없는 이메일입니다.',
          // 비밀번호 정책
          WEAK_PASSWORD:       '비밀번호는 8자 이상 영문/숫자 조합을 사용해주세요.',
        }
        setError(safeErrMap[data.error?.code] || '오류가 발생했습니다. 다시 시도해주세요.')
        return
      }

      // 서버 발급 토큰만 사용 (임시 객체 생성 금지)
      onLoginSuccess(
        data.data.token,
        data.data.user_id,
        data.data.nickname,
        data.data.status || 'ACTIVE'
      )
    } catch {
      setError('네트워크 오류가 발생했습니다. 연결을 확인해주세요.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'white',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  // ─────────────────────────────────────────────
  // 카카오 콜백 처리 중 로딩 화면
  // ─────────────────────────────────────────────
  if (snsLoading === '카카오') {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0a0a0c',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
      }}>
        <div style={{
          width: '48px', height: '48px',
          border: '2px solid rgba(254,229,0,0.2)',
          borderTop: '2px solid #FEE500',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>
          카카오 로그인 처리 중...
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ─────────────────────────────────────────────
  // 메인 렌더
  // ─────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0a0a0c',
      padding: '20px',
      paddingTop: 'max(48px, env(safe-area-inset-top))',
      paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
      boxSizing: 'border-box',
    }}>

      {/* ← 뒤로가기 — authLanding으로 이동 */}
      <div style={{ marginBottom: '36px' }}>
        <button
          onClick={() => navigateToScreen('authLanding')}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            fontSize: '13px',
            cursor: 'pointer',
            padding: '0',
          }}
        >
          ← 홈으로
        </button>
      </div>

      {/* 제목 + 설명 */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: '24px',
          fontWeight: '300',
          letterSpacing: '0.05em',
          marginBottom: '8px',
        }}>
          {mode === 'login' ? '로그인' : '회원가입'}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>
          {mode === 'login'
            ? '내 컬렉션을 관리하고 인증 기록을 확인하세요'
            : '레그캠 계정을 만들고 정품 인증과 컬렉션 관리를 시작하세요'}
        </p>
      </div>

      {/* SNS 로그인 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>

        {/* 카카오로 시작하기 */}
        <button
          onClick={handleKakaoLogin}
          style={{
            width: '100%', padding: '14px', borderRadius: '12px',
            background: '#FEE500', border: 'none',
            color: '#000', fontSize: '15px', fontWeight: '600',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.7 1.7 5.1 4.3 6.5l-1.1 4 4.7-3.1c.7.1 1.4.2 2.1.2 5.523 0 10-3.477 10-7.8S17.523 3 12 3z" fill="#000"/>
          </svg>
          카카오로 시작하기
        </button>

        {/* 구글 (준비중) */}
        <button
          disabled
          style={{
            width: '100%', padding: '14px', borderRadius: '12px',
            background: '#fff', border: '1px solid rgba(0,0,0,0.1)',
            color: '#333', fontSize: '15px', fontWeight: '600',
            cursor: 'not-allowed', opacity: 0.4,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          구글로 계속하기 (준비중)
        </button>
      </div>

      {/* 구분선 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px' }}>
          {mode === 'login' ? '또는 이메일로 로그인' : '또는 이메일로 회원가입'}
        </span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
      </div>

      {/* 이메일 입력 필드 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
        {mode === 'register' && (
          <input
            type="text"
            placeholder="닉네임 (선택)"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            style={inputStyle}
          />
        )}
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={inputStyle}
          autoComplete="email"
        />
        <input
          type="password"
          placeholder={mode === 'login' ? '비밀번호' : '비밀번호 (8자 이상)'}
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={inputStyle}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      </div>

      {/* 에러 메시지 */}
      {error && (
        <p style={{
          color: '#f87171',
          fontSize: '13px',
          marginBottom: '12px',
          textAlign: 'center',
        }}>
          {error}
        </p>
      )}

      {/* 제출 버튼 */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{
          width: '100%', padding: '15px', borderRadius: '12px',
          background: 'rgba(167,139,250,0.15)',
          border: '1px solid rgba(167,139,250,0.3)',
          color: '#a78bfa', fontSize: '15px', fontWeight: '600',
          cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: '12px',
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading
          ? '처리 중...'
          : mode === 'login' ? '이메일 로그인' : '회원가입 완료'}
      </button>

      {/* 로그인 ↔ 회원가입 전환 — navigateToScreen 경유 */}
      <button
        onClick={() => navigateToScreen(mode === 'login' ? 'register' : 'login')}
        style={{
          width: '100%', padding: '14px', borderRadius: '12px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.7)',
          fontSize: '14px', fontWeight: '500', cursor: 'pointer',
        }}
      >
        {mode === 'login'
          ? '아직 계정이 없나요? 회원가입'
          : '이미 계정이 있나요? 로그인'}
      </button>
    </div>
  )
}

export default LoginScreen
