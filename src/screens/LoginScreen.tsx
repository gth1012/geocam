import { useState } from 'react'
import { KakaoLoginPlugin } from 'capacitor-kakao-login-plugin'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import type { LoginScreenProps } from '../types/app.types'

const API_BASE = 'https://api.artionchain.com/api';

const LoginScreen = ({ safeGoHome, onLoginSuccess }: LoginScreenProps) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('Please enter your email and password.')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const endpoint = mode === 'login' ? '/user/auth/login' : '/user/auth/signup'
      const body: any = { email, password }
      if (mode === 'signup' && nickname) body.nickname = nickname

      const res = await fetch(API_BASE + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!data.success) {
        setError(data.error?.message || 'Login failed.')
        return
      }

      onLoginSuccess(data.data.token, data.data.user_id, data.data.nickname, data.data.status || 'ACTIVE')
    } catch (e) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSnsLogin = async (provider: string) => {
    if (provider === 'kakao') {
      try {
        const result = await KakaoLoginPlugin.goLogin()
        if (result.accessToken) {
          const res = await fetch(API_BASE + '/user/auth/kakao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: result.accessToken }),
          })
          const data = await res.json()
          if (data.success) {
            onLoginSuccess(data.data.token, data.data.user_id, data.data.nickname, data.data.status || 'ACTIVE')
          } else {
            alert('Login failed: ' + (data.error?.message || 'unknown'))
          }
        }
      } catch (e: any) {
        alert('Kakao login failed: ' + e.message)
      }
      return
    }

    if (provider === 'google') {
      try {
        await GoogleAuth.initialize({
          clientId: '443118969490-cfo1b6peii07cm7a9js3vauer5p59667.apps.googleusercontent.com',
          scopes: ['profile', 'email'],
          grantOfflineAccess: true,
        })
        const googleUser = await GoogleAuth.signIn()
        const idToken = googleUser.authentication?.idToken
        if (!idToken) {
          alert('Google login failed: no id_token')
          return
        }
        const res = await fetch(API_BASE + '/user/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_token: idToken }),
        })
        const data = await res.json()
        if (data.success) {
          onLoginSuccess(data.data.token, data.data.user_id, data.data.nickname, data.data.status || 'ACTIVE')
        } else {
          alert('Google login failed: ' + (data.error?.message || 'unknown'))
        }
      } catch (e: any) {
        alert('Google login failed: ' + e.message)
      }
      return
    }

    alert(provider + ' login is not implemented yet.')
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

  const snsIcons = [
    {
      name: 'kakao',
      bg: '#FEE500',
      icon: <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.7 1.7 5.1 4.3 6.5l-1.1 4 4.7-3.1c.7.1 1.4.2 2.1.2 5.523 0 10-3.477 10-7.8S17.523 3 12 3z" fill="#000"/></svg>,
    },
    {
      name: 'naver',
      bg: '#03C75A',
      icon: <svg width="16" height="16" viewBox="0 0 24 24"><path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z" fill="white"/></svg>,
    },
    {
      name: 'google',
      bg: '#fff',
      border: '1px solid rgba(0,0,0,0.1)',
      icon: <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>,
    },
    {
      name: 'facebook',
      bg: '#1877F2',
      icon: <svg width="16" height="16" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="white"/></svg>,
    },
    {
      name: 'X',
      bg: '#000',
      border: '1px solid rgba(255,255,255,0.1)',
      icon: <svg width="16" height="16" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill="white"/></svg>,
    },
    {
      name: 'instagram',
      bg: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)',
      icon: <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" fill="white"/></svg>,
    },
  ]

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
      <div style={{ marginBottom: '36px' }}>
        <button onClick={safeGoHome} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '13px', cursor: 'pointer', padding: '0' }}>
          &larr; Back
        </button>
      </div>

      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '24px', fontWeight: '300', letterSpacing: '0.05em', marginBottom: '8px' }}>
          {mode === 'login' ? 'Sign In' : 'Sign Up'}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>
          {mode === 'login' ? 'Sign in to your LegitTag account' : 'Create your LegitTag account'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
        {mode === 'signup' && (
          <input type="text" placeholder="Nickname (optional)" value={nickname} onChange={e => setNickname(e.target.value)} style={inputStyle} />
        )}
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
        <input type="password" placeholder="Password (min 6 chars)" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
      </div>

      {error && <p style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px', textAlign: 'center' }}>{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{
          width: '100%', padding: '15px', borderRadius: '12px',
          background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)',
          color: '#a78bfa', fontSize: '15px', fontWeight: '600',
          cursor: 'pointer', marginBottom: '12px', opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Sign Up'}
      </button>

      <button
        onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}
        style={{
          width: '100%', padding: '14px', borderRadius: '12px',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.7)', fontSize: '14px', fontWeight: '500',
          cursor: 'pointer', marginBottom: '40px',
        }}
      >
        {mode === 'login' ? 'Create an account' : 'Already have an account? Sign In'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px' }}>or continue with</span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
        {snsIcons.map(btn => (
          <button
            key={btn.name}
            onClick={() => handleSnsLogin(btn.name)}
            title={btn.name}
            style={{
              width: '38px', height: '38px', borderRadius: '50%',
              background: btn.bg,
              border: (btn as any).border || 'none',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {btn.icon}
          </button>
        ))}
      </div>
    </div>
  )
}

export default LoginScreen
