import { useState } from 'react'
import type { RegisterPendingScreenProps } from '../types/app.types'

const API_BASE = 'https://api.artionchain.com/api';

const RegisterPendingScreen = ({ onProfileComplete, authToken }: RegisterPendingScreenProps) => {
  const [nickname, setNickname] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleComplete = async () => {
    if (!nickname || !phone) {
      setError('All fields are required.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(API_BASE + '/user/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ nickname, phone }),
      })

      const data = await res.json()

      if (!data.success) {
        const code = data.error?.code
        if (code === 'INVALID_NICKNAME') {
          setError('Nickname must be 2~12 chars. Korean, English, numbers, and _ only.')
        } else if (code === 'FORBIDDEN_NICKNAME') {
          setError('This nickname is not allowed.')
        } else if (code === 'INVALID_PHONE') {
          setError('Please enter a valid phone number (10~11 digits, no dashes).')
        } else if (code === 'PHONE_EXISTS') {
          setError('This phone number is already in use.')
        } else {
          setError(data.error?.message || 'Something went wrong.')
        }
        return
      }

      onProfileComplete(data.data.nickname)
    } catch (e) {
      setError('Network error. Please try again.')
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

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0a0a0c',
      padding: '20px',
      paddingTop: 'max(60px, env(safe-area-inset-top))',
      paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
      boxSizing: 'border-box',
    }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: '24px',
          fontWeight: '300',
          letterSpacing: '0.05em',
          marginBottom: '8px',
        }}>
          Additional Info
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>
          Please fill in the details below to continue.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Nickname (2~12 chars)"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          style={inputStyle}
        />
        <input
          type="tel"
          placeholder="Phone number (no dashes)"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          style={inputStyle}
        />
      </div>

      {error && (
        <p style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px', textAlign: 'center' }}>
          {error}
        </p>
      )}

      <button
        onClick={handleComplete}
        disabled={loading}
        style={{
          width: '100%',
          padding: '15px',
          borderRadius: '12px',
          background: 'rgba(167,139,250,0.15)',
          border: '1px solid rgba(167,139,250,0.3)',
          color: '#a78bfa',
          fontSize: '15px',
          fontWeight: '600',
          cursor: 'pointer',
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? 'Saving...' : 'Complete'}
      </button>

      <p style={{
        color: 'rgba(255,255,255,0.2)',
        fontSize: '11px',
        textAlign: 'center',
        marginTop: '24px',
        letterSpacing: '0.05em',
      }}>
        This information is required to use all features.
      </p>
    </div>
  )
}

export default RegisterPendingScreen
