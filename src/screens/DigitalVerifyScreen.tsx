import { useState, useRef } from 'react'
import { Device } from '@capacitor/device'
import type { DigitalVerifyScreenProps, DigitalVerifyStatus, DigitalVerifyResult } from '../types/app.types'

const API_BASE_URL = 'https://geo-api.artionchain.com'
const NEO_API_URL = 'https://neo-api.artionchain.com'

const STATUS_CONFIG: Record<NonNullable<DigitalVerifyStatus>, { color: string; border: string; bg: string; label: string; sublabel: string }> = {
  ORIGINAL:  {
    color: '#34d399',
    border: 'rgba(52,211,153,0.35)',
    bg: 'rgba(52,211,153,0.08)',
    label: '디지털 원본 인증됨',
    sublabel: 'GeoStudio 출고 원본 파일',
  },
  MODIFIED:  {
    color: '#fbbf24',
    border: 'rgba(251,191,36,0.35)',
    bg: 'rgba(251,191,36,0.08)',
    label: '변형 감지됨',
    sublabel: '압축 또는 변환된 파일 — 원본성 보장 불가',
  },
  TAMPERED:  {
    color: '#f97316',
    border: 'rgba(249,115,22,0.35)',
    bg: 'rgba(249,115,22,0.08)',
    label: '⚠ 위조 시도 감지됨',
    sublabel: 'GeoCode 무결성 손상 — 신뢰 불가',
  },
  INVALID:   {
    color: 'rgba(255,255,255,0.4)',
    border: 'rgba(255,255,255,0.1)',
    bg: 'rgba(255,255,255,0.04)',
    label: '미등록 파일',
    sublabel: 'GeoStudio에 등록되지 않은 파일',
  },
  ERROR:     {
    color: 'rgba(255,255,255,0.3)',
    border: 'rgba(255,255,255,0.08)',
    bg: 'rgba(255,255,255,0.03)',
    label: '오류 발생',
    sublabel: 'Verification error',
  },
}

const DigitalVerifyScreen = ({ safeGoHome, BackArrow, setScreen }: DigitalVerifyScreenProps) => {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DigitalVerifyResult | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [mode, setMode] = useState<'image' | 'capsule'>('capsule')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Ownership 등록 상태
  const [ownershipLoading, setOwnershipLoading] = useState(false)
  const [ownershipDone, setOwnershipDone] = useState(false)
  const [ownershipError, setOwnershipError] = useState<string | null>(null)

  const handleCapsuleSelect = () => { fileInputRef.current?.click() }
  const handleImageSelect = () => { imageInputRef.current?.click() }

  const handleCapsuleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResult(null)
    setOwnershipDone(false)
    setOwnershipError(null)
    await runCapsuleDetect(file)
    e.target.value = ''
  }

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResult(null)
    setOwnershipDone(false)
    setOwnershipError(null)
    await runImageDetect(file)
    e.target.value = ''
  }

  const runCapsuleDetect = async (file: File) => {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file, file.name)
      const response = await fetch(`${API_BASE_URL}/api/digital/detect-capsule`, {
        method: 'POST',
        headers: { 'x-api-key': 'geo-artion-2026-prod' },
        body: formData,
      })
      if (!response.ok) {
        setResult({ status: 'ERROR', pearson_r: null, score: null, asset: null, message: `HTTP ${response.status}` })
        return
      }
      const data = await response.json()
      setResult({
        status:    data.status    ?? 'ERROR',
        pearson_r: data.pearson_r ?? null,
        score:     data.score     ?? null,
        asset:     data.asset     ?? null,
        message:   data.message   ?? null,
      })
    } catch (err: any) {
      setResult({ status: 'ERROR', pearson_r: null, score: null, asset: null, message: err?.message || '네트워크 오류' })
    } finally {
      setLoading(false)
    }
  }

  const runImageDetect = async (file: File) => {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file, file.name)
      const response = await fetch(`${API_BASE_URL}/api/digital/detect`, {
        method: 'POST',
        headers: { 'x-api-key': 'geo-artion-2026-prod' },
        body: formData,
      })
      if (!response.ok) {
        setResult({ status: 'ERROR', pearson_r: null, score: null, asset: null, message: `HTTP ${response.status}` })
        return
      }
      const data = await response.json()
      setResult({
        status:    data.status    ?? 'ERROR',
        pearson_r: data.pearson_r ?? null,
        score:     data.score     ?? null,
        asset:     data.asset     ?? null,
        message:   data.message   ?? null,
      })
    } catch (err: any) {
      setResult({ status: 'ERROR', pearson_r: null, score: null, asset: null, message: err?.message || '네트워크 오류' })
    } finally {
      setLoading(false)
    }
  }

  // 내 컬렉션 등록 — Ownership Register
  const handleOwnershipRegister = async () => {
    if (!result?.asset?.dina_id) return
    setOwnershipLoading(true)
    setOwnershipError(null)
    try {
      // device ID를 owner_id로 사용
      const deviceInfo = await Device.getId()
      const ownerId = deviceInfo.identifier

      const response = await fetch(`${NEO_API_URL}/api/geocam/ownership/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dina_id: result.asset.dina_id,
          owner_id: ownerId,
          asset_id: result.asset.dina_id,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setOwnershipError(data.error || '등록 실패')
        return
      }
      setOwnershipDone(true)
    } catch (err: any) {
      setOwnershipError(err?.message || '네트워크 오류')
    } finally {
      setOwnershipLoading(false)
    }
  }

  const cfg = result?.status ? STATUS_CONFIG[result.status] : null
  const showOwnershipBtn = result?.status === 'ORIGINAL' && result?.asset?.dina_id && !ownershipDone

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0a0a0c',
      padding: '0 24px',
      paddingTop: 'max(48px, env(safe-area-inset-top))',
      paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
      boxSizing: 'border-box',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
        <button onClick={safeGoHome} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 8px 8px 0', marginRight: '12px' }}>
          <BackArrow />
        </button>
        <div>
          <p style={{ color: 'rgba(167,139,250,0.7)', fontSize: '10px', letterSpacing: '0.2em', fontWeight: '300', margin: '0 0 2px' }}>SS PRN</p>
          <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '18px', fontWeight: '200', letterSpacing: '0.1em', margin: '0' }}>Digital Verify</h2>
        </div>
      </div>

      {/* 모드 선택 탭 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button
          onClick={() => { setMode('capsule'); setResult(null); setFileName(null); setOwnershipDone(false); setOwnershipError(null); }}
          style={{
            flex: 1, padding: '10px', borderRadius: '12px', fontSize: '12px', fontWeight: '400', cursor: 'pointer',
            background: mode === 'capsule' ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.03)',
            border: mode === 'capsule' ? '1px solid rgba(167,139,250,0.35)' : '1px solid rgba(255,255,255,0.06)',
            color: mode === 'capsule' ? '#a78bfa' : 'rgba(255,255,255,0.4)',
            letterSpacing: '0.05em',
          }}
        >
          인증 캡슐 열기
        </button>
        <button
          onClick={() => { setMode('image'); setResult(null); setFileName(null); setOwnershipDone(false); setOwnershipError(null); }}
          style={{
            flex: 1, padding: '10px', borderRadius: '12px', fontSize: '12px', fontWeight: '400', cursor: 'pointer',
            background: mode === 'image' ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.03)',
            border: mode === 'image' ? '1px solid rgba(167,139,250,0.35)' : '1px solid rgba(255,255,255,0.06)',
            color: mode === 'image' ? '#a78bfa' : 'rgba(255,255,255,0.4)',
            letterSpacing: '0.05em',
          }}
        >
          이미지 검증
        </button>
      </div>

      {/* 업로드 영역 */}
      <div
        onClick={!loading ? (mode === 'capsule' ? handleCapsuleSelect : handleImageSelect) : undefined}
        style={{
          width: '100%', aspectRatio: '1 / 1', borderRadius: '20px',
          border: fileName ? '1px solid rgba(255,255,255,0.08)' : '1px dashed rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.02)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', cursor: loading ? 'default' : 'pointer',
          marginBottom: '24px', position: 'relative',
        }}
      >
        {fileName && !loading ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '32px', margin: '0 0 12px' }}>
              {mode === 'capsule' ? '📦' : '🖼'}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: '300', margin: '0', wordBreak: 'break-all' }}>
              {fileName}
            </p>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '32px', margin: '0 0 8px' }}>+</p>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', fontWeight: '300', letterSpacing: '0.05em', margin: '0' }}>
              {mode === 'capsule' ? '인증 캡슐 선택' : '이미지 선택'}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.15)', fontSize: '11px', fontWeight: '300', margin: '6px 0 0' }}>
              {mode === 'capsule' ? '.zip 파일을 선택하세요' : '이미지 파일을 선택하세요'}
            </p>
          </div>
        )}

        {loading && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(10,10,12,0.75)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '20px',
          }}>
            <div style={{
              width: '32px', height: '32px',
              border: '2px solid rgba(167,139,250,0.2)', borderTop: '2px solid #a78bfa',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }} />
            <p style={{ color: 'rgba(167,139,250,0.7)', fontSize: '12px', fontWeight: '300', marginTop: '12px', letterSpacing: '0.1em' }}>검증 중...</p>
          </div>
        )}
      </div>

      {/* hidden input */}
      <input ref={fileInputRef} type="file" accept="*/*" style={{ display: 'none' }} onChange={handleCapsuleChange} />
      <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />

      {/* 결과 카드 */}
      {result && cfg && !loading && (
        <div style={{
          borderRadius: '16px', border: `1px solid ${cfg.border}`,
          background: cfg.bg, padding: '20px', marginBottom: '20px',
        }}>
          <div style={{ marginBottom: '16px' }}>
            <p style={{ color: cfg.color, fontSize: '18px', fontWeight: '400', letterSpacing: '0.05em', margin: '0 0 4px' }}>{cfg.label}</p>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', fontWeight: '300', letterSpacing: '0.05em', margin: '0' }}>{cfg.sublabel}</p>
          </div>

          {result.pearson_r !== null && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '14px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', fontWeight: '300', letterSpacing: '0.1em', margin: '0' }}>PEARSON R</p>
                <p style={{ color: cfg.color, fontSize: '15px', fontWeight: '400', margin: '0' }}>{result.pearson_r.toFixed(4)}</p>
              </div>
              <div style={{ marginTop: '8px', height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)' }}>
                <div style={{
                  height: '100%', borderRadius: '2px',
                  width: `${Math.max(0, Math.min(100, result.pearson_r * 100))}%`,
                  background: cfg.color, transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          )}

          {result.asset && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {result.asset.dina_id && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', fontWeight: '300', letterSpacing: '0.1em', margin: '0' }}>DINA ID</p>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: '300', margin: '0', fontFamily: 'monospace' }}>{result.asset.dina_id}</p>
                </div>
              )}
              {result.asset.series && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', fontWeight: '300', letterSpacing: '0.1em', margin: '0' }}>SERIES</p>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: '300', margin: '0' }}>{result.asset.series}</p>
                </div>
              )}
              {result.asset.artist && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', fontWeight: '300', letterSpacing: '0.1em', margin: '0' }}>ARTIST</p>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: '300', margin: '0' }}>{result.asset.artist}</p>
                </div>
              )}
            </div>
          )}

          {result.status === 'ERROR' && result.message && (
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', fontWeight: '300', margin: '12px 0 0' }}>{result.message}</p>
          )}

          {/* Ownership 등록 완료 표시 */}
          {ownershipDone && (
            <div style={{ borderTop: '1px solid rgba(52,211,153,0.15)', paddingTop: '14px', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#34d399', fontSize: '14px' }}>✓</span>
              <p style={{ color: '#34d399', fontSize: '13px', fontWeight: '400', margin: '0' }}>내 컬렉션에 등록됐습니다</p>
            </div>
          )}

          {ownershipError && (
            <p style={{ color: '#f87171', fontSize: '12px', fontWeight: '300', margin: '12px 0 0' }}>{ownershipError}</p>
          )}
        </div>
      )}

      {/* 액션 버튼 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto' }}>

        {/* 내 컬렉션 등록 버튼 — ORIGINAL 판정 시에만 표시 */}
        {showOwnershipBtn && !loading && (
          <button
            onClick={handleOwnershipRegister}
            disabled={ownershipLoading}
            style={{
              width: '100%', padding: '15px', borderRadius: '16px',
              background: ownershipLoading ? 'rgba(52,211,153,0.05)' : 'rgba(52,211,153,0.12)',
              border: '1px solid rgba(52,211,153,0.35)',
              color: '#34d399', fontSize: '14px', fontWeight: '400',
              cursor: ownershipLoading ? 'default' : 'pointer', letterSpacing: '0.05em',
              opacity: ownershipLoading ? 0.6 : 1,
            }}
          >
            {ownershipLoading ? '등록 중...' : '내 컬렉션 등록'}
          </button>
        )}

        {fileName && !loading && (
          <button
            onClick={mode === 'capsule' ? handleCapsuleSelect : handleImageSelect}
            style={{
              width: '100%', padding: '15px', borderRadius: '16px',
              background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)',
              color: '#a78bfa', fontSize: '14px', fontWeight: '400', cursor: 'pointer', letterSpacing: '0.05em',
            }}
          >
            다른 파일 선택
          </button>
        )}
        {!fileName && !loading && (
          <button
            onClick={mode === 'capsule' ? handleCapsuleSelect : handleImageSelect}
            style={{
              width: '100%', padding: '15px', borderRadius: '16px',
              background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)',
              color: '#a78bfa', fontSize: '14px', fontWeight: '400', cursor: 'pointer', letterSpacing: '0.05em',
            }}
          >
            {mode === 'capsule' ? '인증 캡슐 선택' : '이미지 선택'}
          </button>
        )}
        <button
          onClick={safeGoHome}
          style={{
            width: '100%', padding: '15px', borderRadius: '16px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.4)', fontSize: '14px', fontWeight: '300', cursor: 'pointer', letterSpacing: '0.05em',
          }}
        >
          홈
        </button>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

export default DigitalVerifyScreen
