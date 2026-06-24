import { useState, useEffect } from 'react'
import type { ClaimBundleScreenProps } from '../types/app.types'

const NEO_API = 'https://neo-api.artionchain.com'

type BundleStep = 'verifying' | 'preview' | 'claiming' | 'success' | 'error'

interface BundleAsset {
  asset_id: string;
  dina_id: string | null;
  geocapsule_status: string | null;
  ownership_status: 'UNCLAIMED' | 'CLAIMED';
  claimable: boolean;
  reason: string | null;
}

interface BundleVerifyResult {
  valid: boolean;
  shipment_id: string;
  assets: BundleAsset[];
  expires_at: string;
}

interface ClaimResult {
  asset_id: string;
  ownership_id: string;
  collection_id: string;
}

export default function ClaimBundleScreen({
  safeGoHome, BackArrow, navigateToScreen, bundleClaimToken, authToken, userId
}: ClaimBundleScreenProps) {
  const [step, setStep] = useState<BundleStep>('verifying')
  const [bundleInfo, setBundleInfo] = useState<BundleVerifyResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set<string>())
  const [claimMode, setClaimMode] = useState<'all' | 'select'>('all')
  const [claimedResults, setClaimedResults] = useState<ClaimResult[]>([])
  const [skippedResults, setSkippedResults] = useState<{ asset_id: string; reason: string }[]>([])

  useEffect(() => {
    if (!bundleClaimToken) {
      setErrorMsg('유효하지 않은 링크입니다.')
      setStep('error')
      return
    }
    verifyBundleToken()
  }, [bundleClaimToken])

  const verifyBundleToken = async () => {
    setStep('verifying')
    try {
      const res = await fetch(`${NEO_API}/api/capsule/claim/bundle/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: bundleClaimToken }),
      })
      const data = await res.json()

      if (!res.ok) {
        const msgMap: Record<string, string> = {
          TOKEN_NOT_FOUND: '유효하지 않은 링크입니다. 발급처에 문의해주세요.',
          TOKEN_REVOKED: '취소된 링크입니다. 발급처에 문의해주세요.',
          TOKEN_EXPIRED: '만료된 링크입니다. 발급처에 재발급을 요청해주세요.',
          TOKEN_FULLY_CLAIMED: '이미 모든 굿즈의 소유권이 등록된 링크입니다.',
        }
        setErrorMsg(msgMap[data.error] || data.message || '링크 확인에 실패했습니다.')
        setStep('error')
        return
      }

      setBundleInfo(data)
      // Set<string> 명시 — asset_id는 string 보장
      const claimableIds = new Set<string>(
        data.assets
          .filter((a: BundleAsset) => a.claimable)
          .map((a: BundleAsset) => a.asset_id)
          .filter((id: unknown): id is string => typeof id === 'string')
      )
      setSelectedAssets(claimableIds)
      setStep('preview')
    } catch {
      setErrorMsg('네트워크 오류가 발생했습니다. 다시 시도해주세요.')
      setStep('error')
    }
  }

  const toggleAsset = (assetId: string) => {
    setSelectedAssets(prev => {
      const next = new Set<string>(prev)
      if (next.has(assetId)) {
        next.delete(assetId)
      } else {
        next.add(assetId)
      }
      return next
    })
  }

  const selectAll = () => {
    if (!bundleInfo) return
    const claimableIds = new Set<string>(
      bundleInfo.assets
        .filter(a => a.claimable)
        .map(a => a.asset_id)
        .filter((id): id is string => typeof id === 'string')
    )
    setSelectedAssets(claimableIds)
    setClaimMode('all')
  }

  const handleBundleClaim = async () => {
    if (!bundleClaimToken || !userId) {
      navigateToScreen('login')
      return
    }
    if (selectedAssets.size === 0) return

    setStep('claiming')
    try {
      const res = await fetch(`${NEO_API}/api/capsule/claim/bundle/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: bundleClaimToken,
          consumer_id: userId,
          asset_ids: Array.from(selectedAssets),
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        const msgMap: Record<string, string> = {
          TOKEN_REVOKED: '취소된 링크입니다.',
          TOKEN_EXPIRED: '만료된 링크입니다.',
          TOKEN_FULLY_CLAIMED: '이미 모든 굿즈의 소유권이 등록된 링크입니다.',
          ASSET_OUT_OF_SCOPE: '요청한 자산이 해당 출고에 포함되지 않습니다.',
        }
        setErrorMsg(msgMap[data.error] || data.message || '소유권 등록에 실패했습니다.')
        setStep('error')
        return
      }

      setClaimedResults(data.claimed || [])
      setSkippedResults(data.skipped || [])
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

  const claimableAssets = bundleInfo?.assets.filter(a => a.claimable) || []
  const alreadyClaimedAssets = bundleInfo?.assets.filter(a => !a.claimable) || []

  if (step === 'verifying' || step === 'claiming') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ width: '48px', height: '48px', border: '2px solid rgba(167,139,250,0.2)', borderTop: '2px solid #a78bfa', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '20px' }} />
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', fontWeight: '300' }}>
          {step === 'verifying' ? '굿즈 정보를 확인하는 중...' : '소유권 등록 중...'}
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
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', letterSpacing: '0.15em', marginBottom: '8px' }}>링크 확인 실패</p>
          <h2 style={{ color: 'rgba(255,255,255,0.85)', fontSize: '20px', fontWeight: '300', marginBottom: '12px' }}>소유권 등록 불가</h2>
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
          <p style={{ color: 'rgba(167,139,250,0.7)', fontSize: '11px', letterSpacing: '0.15em', marginBottom: '8px' }}>소유권 등록 완료</p>
          <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '22px', fontWeight: '200', letterSpacing: '0.03em', marginBottom: '8px' }}>공식 인증 굿즈가<br />내 컬렉션에 등록됐습니다</h2>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px', fontWeight: '300', marginBottom: '32px' }}>
            {claimedResults.length}개 굿즈
            {skippedResults.length > 0 && ` (${skippedResults.length}개는 이미 등록됨)`}
          </p>
          {claimedResults.length > 0 && (
            <div style={{ width: '100%', maxWidth: '320px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '16px', marginBottom: '16px', textAlign: 'left' }}>
              <p style={{ color: 'rgba(167,139,250,0.6)', fontSize: '10px', letterSpacing: '0.1em', marginBottom: '12px' }}>등록 완료 — {claimedResults.length}건</p>
              {claimedResults.map((r, i) => (
                <div key={r.asset_id} style={{ marginBottom: i < claimedResults.length - 1 ? '10px' : 0, paddingBottom: i < claimedResults.length - 1 ? '10px' : 0, borderBottom: i < claimedResults.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', marginBottom: '2px' }}>소유권 ID</p>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', fontFamily: 'monospace' }}>{r.ownership_id.slice(0, 20)}...</p>
                </div>
              ))}
            </div>
          )}
          <div style={{ width: '100%', maxWidth: '320px', backgroundColor: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.1)', borderRadius: '12px', padding: '12px', marginBottom: '24px' }}>
            <p style={{ color: '#a78bfa', fontSize: '12px', fontWeight: '500', textAlign: 'center' }}>공식 인증 소유권 등록 완료</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={() => navigateToScreen('myCollection')} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)', color: '#a78bfa', fontSize: '15px', fontWeight: '400', cursor: 'pointer', letterSpacing: '0.03em' }}>
            내 컬렉션 보기
          </button>
          <button onClick={safeGoHome} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', fontSize: '15px', fontWeight: '300', cursor: 'pointer' }}>
            홈으로
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0c', display: 'flex', flexDirection: 'column', padding: '24px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
      <button onClick={safeGoHome} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '28px', padding: 0 }}>
        <BackArrow />
      </button>
      <div style={{ marginBottom: '24px' }}>
        <p style={{ color: 'rgba(167,139,250,0.7)', fontSize: '11px', letterSpacing: '0.15em', marginBottom: '6px' }}>OFFICIAL CERTIFIED GOODS</p>
        <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '22px', fontWeight: '200', letterSpacing: '0.03em', marginBottom: '8px' }}>공식 인증 굿즈 수령 확인</h2>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '13px', fontWeight: '300', lineHeight: '1.6' }}>
          기획사에서 발송한 공식 인증 굿즈입니다.{'\n'}소유권 등록 후 내 컬렉션에서 확인할 수 있습니다.
        </p>
      </div>
      <div style={{ backgroundColor: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>상태</span>
        <span style={{ color: '#a78bfa', fontSize: '12px', fontWeight: '500' }}>소유권 등록 대기</span>
      </div>
      {bundleInfo?.expires_at && (
        <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>링크 만료</span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>{formatDate(bundleInfo.expires_at)}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button onClick={selectAll} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: claimMode === 'all' ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${claimMode === 'all' ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.06)'}`, color: claimMode === 'all' ? '#a78bfa' : 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer' }}>
          전체 등록 ({claimableAssets.length})
        </button>
        <button onClick={() => setClaimMode('select')} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: claimMode === 'select' ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${claimMode === 'select' ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.06)'}`, color: claimMode === 'select' ? '#a78bfa' : 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer' }}>
          선택 등록
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px' }}>
        {claimableAssets.map(asset => (
          <div key={asset.asset_id} onClick={() => claimMode === 'select' && toggleAsset(asset.asset_id)} style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: `1px solid ${selectedAssets.has(asset.asset_id) ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.06)'}`, borderRadius: '14px', padding: '14px 16px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', cursor: claimMode === 'select' ? 'pointer' : 'default' }}>
            {claimMode === 'select' && (
              <div style={{ width: '20px', height: '20px', borderRadius: '6px', border: `1px solid ${selectedAssets.has(asset.asset_id) ? '#a78bfa' : 'rgba(255,255,255,0.2)'}`, backgroundColor: selectedAssets.has(asset.asset_id) ? 'rgba(167,139,250,0.2)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {selectedAssets.has(asset.asset_id) && <span style={{ color: '#a78bfa', fontSize: '12px' }}>✓</span>}
              </div>
            )}
            <div style={{ flex: 1 }}>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '12px', fontFamily: 'monospace', marginBottom: '3px' }}>{asset.dina_id || asset.asset_id.slice(0, 16) + '...'}</p>
              <p style={{ color: 'rgba(167,139,250,0.6)', fontSize: '10px' }}>소유권 등록 대기</p>
            </div>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#a78bfa', flexShrink: 0 }} />
          </div>
        ))}
        {alreadyClaimedAssets.map(asset => (
          <div key={asset.asset_id} style={{ backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '14px', padding: '14px 16px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', opacity: 0.5 }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontFamily: 'monospace', marginBottom: '3px' }}>{asset.dina_id || asset.asset_id.slice(0, 16) + '...'}</p>
              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px' }}>이미 소유권 등록 완료</p>
            </div>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
          </div>
        ))}
      </div>
      <div style={{ backgroundColor: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.1)', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: '300', lineHeight: '1.7' }}>
          소유권 등록은 1회만 가능하며 취소할 수 없습니다.{'\n'}등록 후 내 컬렉션에서 공식 인증 굿즈를 확인할 수 있습니다.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {!authToken && (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '12px', marginBottom: '4px' }}>등록을 완료하려면 본인 확인이 필요합니다.</p>
        )}
        <button
          onClick={authToken ? handleBundleClaim : () => navigateToScreen('login')}
          disabled={authToken ? selectedAssets.size === 0 : false}
          style={{ width: '100%', padding: '17px', borderRadius: '16px', background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.35)', color: '#a78bfa', fontSize: '16px', fontWeight: '400', cursor: selectedAssets.size === 0 && !!authToken ? 'not-allowed' : 'pointer', letterSpacing: '0.03em', opacity: selectedAssets.size === 0 && !!authToken ? 0.5 : 1 }}
        >
          {authToken ? `소유권 등록하기 (${selectedAssets.size}개)` : '로그인 후 소유권 등록'}
        </button>
        <button onClick={safeGoHome} style={{ width: '100%', padding: '15px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)', fontSize: '14px', fontWeight: '300', cursor: 'pointer' }}>
          취소
        </button>
      </div>
    </div>
  )
}
