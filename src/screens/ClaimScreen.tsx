import { useState, useEffect } from 'react'
import type { ClaimScreenProps } from '../types/app.types'

const NEO_API = 'https://neo-api.artionchain.com'

type ClaimStep = 'verifying' | 'preview' | 'claiming' | 'success' | 'error'

interface CapsuleInfo {
  asset_id: string;
  dina_id: string | null;
  capsule_info: {
    geocapsule_status: string | null;
    geocapsule_sha256: string | null;
  };
  expires_at: string;
}

export default function ClaimScreen({ safeGoHome, BackArrow, navigateToScreen, claimToken, authToken, userId }: ClaimScreenProps) {
  const [step, setStep] = useState<ClaimStep>('verifying')
  const [capsuleInfo, setCapsuleInfo] = useState<CapsuleInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [ownershipId, setOwnershipId] = useState<string | null>(null)
  const [collectionId, setCollectionId] = useState<string | null>(null)

  useEffect(() => {
    if (!claimToken) {
      setErrorMsg('유효하지 않은 Claim 링크입니다.')
      setStep('error')
      return
    }
    verifyToken()
  }, [claimToken])

  const verifyToken = async () => {
    setStep('verifying')
    try {
      const res = await fetch(`${NEO_API}/api/capsule/claim/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: claimToken }),
      })
      const data = await res.json()

      if (!res.ok) {
        const msgMap: Record<string, string> = {
          TOKEN_NOT_FOUND: '유효하지 않은 Claim 링크입니다.',
          TOKEN_USED: '이미 사용된 Claim 링크입니다.',
          TOKEN_REVOKED: '취소된 Claim 링크입니다.',
          TOKEN_EXPIRED: '만료된 Claim 링크입니다. 발급처에 재발급을 요청해주세요.',
          ALREADY_CLAIMED: '이미 다른 소유자가 Claim한 자산입니다.',
        }
        setErrorMsg(msgMap[data.error] || data.message || 'Claim 링크 확인에 실패했습니다.')
        setStep('error')
        return
      }

      setCapsuleInfo(data)
      setStep('preview')
    } catch {
      setErrorMsg('네트워크 오류가 발생했습니다. 다시 시도해주세요.')
      setStep('error')
    }
  }

  const handleClaim = async () => {
    if (!claimToken || !userId) {
      navigateToScreen('login')
      return
    }

    setStep('claiming')
    try {
      const res = await fetch(`${NEO_API}/api/capsule/claim/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: claimToken, consumer_id: userId }),
      })
      const data = await res.json()

      if (!res.ok) {
        const msgMap: Record<string, string> = {
          TOKEN_ALREADY_USED: '이미 사용된 Claim 링크입니다.',
          TOKEN_REVOKED: '취소된 Claim 링크입니다.',
          TOKEN_EXPIRED: '만료된 Claim 링크입니다.',
          CLAIM_CONFLICT: '이미 Claim된 자산입니다.',
        }
        setErrorMsg(msgMap[data.error] || data.message || 'Claim 처리에 실패했습니다.')
        setStep('error')
        return
      }

      setOwnershipId(data.ownership_id)
      setCollectionId(data.collection_id)
      setStep('success')
    } catch {
      setErrorMsg('네트워크 오류가 발생했습니다. 다시 시도해주세요.')
      setStep('error')
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  if (step === 'verifying' || step === 'claiming') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ width: '48px', height: '48px', border: '2px solid rgba(167,139,250,0.2)', borderTop: '2px solid #a78bfa', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '20px' }} />
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', fontWeight: '300' }}>
          {step === 'verifying' ? 'Claim 링크 확인 중...' : 'Claim 처리 중...'}
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0c', display: 'flex', flexDirection: 'column', padding: '24px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
        <button onClick={safeGoHome} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '40px', padding: 0 }}>
          <BackArrow />
        </button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', fontSize: '28px' }}>✕</div>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', letterSpacing: '0.15em', marginBottom: '8px' }}>CLAIM FAILED</p>
          <h2 style={{ color: 'rgba(255,255,255,0.85)', fontSize: '20px', fontWeight: '300', marginBottom: '12px' }}>Claim 실패</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', fontWeight: '300', lineHeight: '1.6', maxWidth: '280px' }}>{errorMsg}</p>
        </div>
        <button onClick={safeGoHome} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', fontSize: '15px', fontWeight: '300', cursor: 'pointer' }}>
          홈으로
        </button>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0c', display: 'flex', flexDirection: 'column', padding: '24px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', backgroundColor: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', fontSize: '32px' }}>✓</div>
          <p style={{ color: 'rgba(167,139,250,0.7)', fontSize: '11px', letterSpacing: '0.15em', marginBottom: '8px' }}>CLAIM COMPLETE</p>
          <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '22px', fontWeight: '200', letterSpacing: '0.03em', marginBottom: '8px' }}>소유권 등록 완료</h2>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px', fontWeight: '300', marginBottom: '32px' }}>My Collection에 자산이 귀속되었습니다</p>
          <div style={{ width: '100%', maxWidth: '320px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px', marginBottom: '32px', textAlign: 'left' }}>
            {capsuleInfo?.dina_id && (
              <div style={{ marginBottom: '12px' }}>
                <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px', letterSpacing: '0.1em', marginBottom: '4px' }}>DINA ID</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontFamily: 'monospace' }}>{capsuleInfo.dina_id}</p>
              </div>
            )}
            {ownershipId && (
              <div style={{ marginBottom: '12px' }}>
                <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px', letterSpacing: '0.1em', marginBottom: '4px' }}>OWNERSHIP ID</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontFamily: 'monospace' }}>{ownershipId}</p>
              </div>
            )}
            <div>
              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px', letterSpacing: '0.1em', marginBottom: '4px' }}>STATUS</p>
              <p style={{ color: '#a78bfa', fontSize: '12px', fontWeight: '500' }}>CLAIMED</p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={() => navigateToScreen('myCollection')} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)', color: '#a78bfa', fontSize: '15px', fontWeight: '400', cursor: 'pointer', letterSpacing: '0.03em' }}>
            My Collection 보기
          </button>
          <button onClick={safeGoHome} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', fontSize: '15px', fontWeight: '300', cursor: 'pointer' }}>
            홈으로
          </button>
        </div>
      </div>
    )
  }

  // preview
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0c', display: 'flex', flexDirection: 'column', padding: '24px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
      <button onClick={safeGoHome} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '32px', padding: 0 }}>
        <BackArrow />
      </button>
      <div style={{ marginBottom: '32px' }}>
        <p style={{ color: 'rgba(167,139,250,0.7)', fontSize: '11px', letterSpacing: '0.15em', marginBottom: '6px' }}>GEOCAPSULE CLAIM</p>
        <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '22px', fontWeight: '200', letterSpacing: '0.03em', marginBottom: '4px' }}>인증 캡슐 수령</h2>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px', fontWeight: '300' }}>자산을 My Collection에 등록합니다</p>
      </div>
      <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '20px', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🎴</div>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '15px', fontWeight: '400' }}>정품 인증 자산</p>
            <p style={{ color: 'rgba(167,139,250,0.6)', fontSize: '11px', marginTop: '2px' }}>GeoCapsule READY</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {capsuleInfo?.dina_id && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>DINA ID</span>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontFamily: 'monospace' }}>{capsuleInfo.dina_id.slice(0, 16)}...</span>
            </div>
          )}
          {capsuleInfo?.expires_at && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>링크 만료</span>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>{formatDate(capsuleInfo.expires_at)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>상태</span>
            <span style={{ color: '#a78bfa', fontSize: '12px', fontWeight: '500' }}>UNCLAIMED → CLAIMED</span>
          </div>
        </div>
      </div>
      <div style={{ backgroundColor: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.1)', borderRadius: '12px', padding: '16px', marginBottom: '32px' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: '300', lineHeight: '1.7' }}>
          수락하면 이 자산이 My Collection에 귀속됩니다.{'\n'}Claim은 1회만 가능하며 취소할 수 없습니다.
        </p>
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {!authToken && (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '12px', marginBottom: '8px' }}>Claim하려면 로그인이 필요합니다</p>
        )}
        <button
          onClick={authToken ? handleClaim : () => navigateToScreen('login')}
          style={{ width: '100%', padding: '17px', borderRadius: '16px', background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.35)', color: '#a78bfa', fontSize: '16px', fontWeight: '400', cursor: 'pointer', letterSpacing: '0.03em' }}
        >
          {authToken ? '✓  수락하고 My Collection에 등록' : '로그인 후 Claim'}
        </button>
        <button onClick={safeGoHome} style={{ width: '100%', padding: '15px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)', fontSize: '14px', fontWeight: '300', cursor: 'pointer' }}>
          취소
        </button>
      </div>
    </div>
  )
}
