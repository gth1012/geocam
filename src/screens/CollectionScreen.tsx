// CollectionScreen.tsx
// ARTION-ARCH-005 기준
// 2026-06-19: MOCK 제거, GET /api/geocam/ownership/:ownerId 실제 연동
// Auth UX 리팩 v2.0 (2026-06-22): setScreen  navigateToScreen 교체
// UI/UX 리팩 v3.1 (2026-06-28): 빈 상태 문구 수정 (LT-UI-001)
// LC-003 (2026-07-01): Path B 구현 — setDinaId 추가, 정품인증 버튼
// NS-ASSET-DISPLAY-001 (2026-07-05): display_image_key, series_name, artist_name, agency_name, status_label 반영
// NS-IDENTITY-001 (2026-07-10): Device.getId()/userId 제거  JWT authToken 기반 /ownership/me 교체 (LC-WEB-001 해결)

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { CollectionScreenProps } from '../types/app.types'

const NEO_API_BASE = 'https://neo-api.artionchain.com/api/geocam'
const R2_BASE_URL = 'https://cdn.artionchain.com'

interface OwnershipItem {
  asset_id: string
  owner_id: string
  ownership_status: string
  claimed_at: string
  updated_at: string
  dina_id: string | null
  series_id: string | null
  asset_public_id: string | null
  display_image_key: string | null
  series_name: string | null
  artist_name: string | null
  agency_name: string | null
  status_label: string | null
}

interface OwnershipResponse {
  success: boolean
  owner_id?: string
  count: number
  items: OwnershipItem[]
}

const CollectionScreen = ({ safeGoHome, BackArrow, authToken, navigateToScreen, setDinaId }: CollectionScreenProps) => {
  const { t } = useTranslation()

  const [items, setItems] = useState<OwnershipItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<OwnershipItem | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [showSellModal, setShowSellModal] = useState(false)
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [selling, setSelling] = useState(false)
  const [sellError, setSellError] = useState<string | null>(null)
  const [sellSuccess, setSellSuccess] = useState(false)

  useEffect(() => {
    const fetchCollection = async () => {
      setLoading(true)
      setError(null)
      // NS-IDENTITY-001: JWT authToken 기반 /ownership/me 호출 (LC-WEB-001 해결)
      if (!authToken) {
        setError('로그인이 필요합니다.')
        setLoading(false)
        return
      }
      try {
        const res = await fetch(`${NEO_API_BASE}/ownership/me`, {
          headers: { 'Authorization': `Bearer ${authToken}` },
        })
        if (!res.ok) {
          setError('서버 응답 오류가 발생했습니다.')
          return
        }
        const data: OwnershipResponse = await res.json()
        if (!data.success) {
          setError('컬렉션 데이터를 불러오지 못했습니다.')
          return
        }
        setItems(data.items || [])
      } catch (e) {
        setError('네트워크 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }
    fetchCollection()
  }, [authToken])

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    })
  }

  const getDisplayImageUrl = (item: OwnershipItem): string | null => {
    if (!item.display_image_key) return null
    return `${R2_BASE_URL}/${item.display_image_key}`
  }

  const getSeriesName = (item: OwnershipItem) => item.series_name ?? '-'
  const getArtistName = (item: OwnershipItem) => item.artist_name ?? '-'
  const getAgencyName = (item: OwnershipItem) => item.agency_name ?? '-'
  const getStatusLabel = (item: OwnershipItem) => item.status_label ?? item.ownership_status ?? '-'

  const handlePhysicalVerify = (item: OwnershipItem) => {
    if (!item.dina_id) return
    setDinaId(item.dina_id)
    navigateToScreen('sizeSelect')
  }

  const handleSell = async () => {
    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      setSellError(t('collection.errorInvalidPrice'))
      return
    }
    if (!authToken) {
      setSellError(t('collection.errorLoginRequired'))
      return
    }
    setSelling(true)
    setSellError(null)
    try {
      const res = await fetch(`${NEO_API_BASE.replace('/geocam', '')}/market/listings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          ownership_id: selectedItem?.asset_id,
          asset_id: selectedItem?.asset_id,
          price: Number(price),
          currency: 'KRW',
          description: description || undefined,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setSellError(data.error?.message || t('collection.errorListFailed'))
        return
      }
      setSellSuccess(true)
    } catch (e) {
      setSellError(t('collection.errorNetwork'))
    } finally {
      setSelling(false)
    }
  }

  const labelStyle = { color: '#a78bfa', fontSize: '12px' }
  const valueStyle = { color: 'rgba(255,255,255,0.85)', fontSize: '14px' }

  const CardThumbnail = ({ item, width, height }: { item: OwnershipItem; width: number; height: number }) => {
    const displayImageUrl = getDisplayImageUrl(item)
    if (displayImageUrl) {
      return (
        <img
          src={displayImageUrl}
          alt={getSeriesName(item)}
          style={{ width: `${width}px`, height: `${height}px`, borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )
    }
    return (
      <div style={{ width: `${width}px`, height: `${height}px`, borderRadius: '8px', background: 'rgba(255,255,255,0.05)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
          <circle cx="9" cy="10" r="2.5" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
          <path d="M3 17l5-4 4 3 3-2 6 3" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }

  if (showSellModal && selectedItem) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))', paddingBottom: 'max(40px, env(safe-area-inset-bottom))', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px' }}>
          <button onClick={() => { setShowSellModal(false); setSellError(null); setPrice(''); setDescription(''); setSellSuccess(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', marginRight: '12px' }}>
            <BackArrow />
          </button>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '500' }}>{t('collection.sellModalTitle')}</span>
        </div>
        {sellSuccess ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(74,222,128,0.1)', border: '2px solid rgba(74,222,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
              <svg width="36" height="36" viewBox="0 0 48 48" fill="none">
                <path d="M15 24l6 6 12-12" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p style={{ color: '#4ade80', fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>{t('collection.sellSuccessTitle')}</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginBottom: '32px' }}>{t('collection.sellSuccessDesc').replace('{price}', Number(price).toLocaleString())}</p>
            <button onClick={() => { setShowSellModal(false); setSellSuccess(false); setPrice(''); setDescription('') }} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: '15px', cursor: 'pointer' }}>
              {t('collection.sellBackButton')}
            </button>
          </div>
        ) : (
          <>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '4px' }}>{getAgencyName(selectedItem)}</p>
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '15px', fontWeight: '500', marginBottom: '4px' }}>{getSeriesName(selectedItem)}</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>{getArtistName(selectedItem)}</p>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <p style={{ color: '#a78bfa', fontSize: '12px', marginBottom: '8px' }}>{t('collection.sellPrice')}</p>
              <div style={{ position: 'relative' }}>
                <input type="number" placeholder="0" value={price} onChange={e => setPrice(e.target.value)} style={{ width: '100%', padding: '14px', paddingRight: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }} />
                <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>KRW</span>
              </div>
              {price && !isNaN(Number(price)) && (
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', marginTop: '6px' }}>{Number(price).toLocaleString()} KRW</p>
              )}
            </div>
            <div style={{ marginBottom: '24px' }}>
              <p style={{ color: '#a78bfa', fontSize: '12px', marginBottom: '8px' }}>{t('collection.sellDescription')}</p>
              <textarea placeholder={t('collection.sellDescriptionPlaceholder')} value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: '14px', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            </div>
            {sellError && <p style={{ color: '#f87171', fontSize: '13px', marginBottom: '16px', textAlign: 'center' }}>{sellError}</p>}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={handleSell} disabled={selling} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24', fontSize: '15px', fontWeight: '500', cursor: 'pointer', opacity: selling ? 0.5 : 1 }}>
                {selling ? t('collection.sellSubmitting') : t('collection.sellSubmit')}
              </button>
              <button onClick={() => { setShowSellModal(false); setSellError(null); setPrice(''); setDescription('') }} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: '15px', cursor: 'pointer' }}>
                {t('collection.sellCancel')}
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  if (selectedItem) {
    const displayImageUrl = getDisplayImageUrl(selectedItem)
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
          <button onClick={() => { setSelectedItem(null); setShowMore(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', marginRight: '12px' }}>
            <BackArrow />
          </button>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '500' }}>{t('collection.detailTitle')}</span>
        </div>
        <div style={{ width: '100%', aspectRatio: '3/4', background: 'rgba(255,255,255,0.05)', borderRadius: '16px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {displayImageUrl ? (
            <img src={displayImageUrl} alt={getSeriesName(selectedItem)} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '16px' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
              <circle cx="9" cy="10" r="2.5" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
              <path d="M3 17l5-4 4 3 3-2 6 3" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={labelStyle}>{t('collection.agency')}</span>
            <span style={valueStyle}>{getAgencyName(selectedItem)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={labelStyle}>{t('collection.series')}</span>
            <span style={valueStyle}>{getSeriesName(selectedItem)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={labelStyle}>{t('collection.artist')}</span>
            <span style={valueStyle}>{getArtistName(selectedItem)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={labelStyle}>{t('collection.status')}</span>
            <span style={{ color: '#4ade80', fontSize: '14px', fontWeight: '500' }}>{getStatusLabel(selectedItem)}</span>
          </div>
        </div>
        <button onClick={() => setShowMore(!showMore)} style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', color: 'rgba(255,255,255,0.5)', fontSize: '13px', cursor: 'pointer', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          {showMore ? t('collection.showLess') + ' ' : t('collection.showMore') + ' '}
        </button>
        {showMore && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <p style={{ color: '#a78bfa', fontSize: '11px', letterSpacing: '0.08em', marginBottom: '10px' }}>{t('collection.claimInfo')}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{t('collection.claimedAt')}</span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>{formatDate(selectedItem.claimed_at)}</span>
              </div>
            </div>
            <div>
              <p style={{ color: '#a78bfa', fontSize: '11px', letterSpacing: '0.08em', marginBottom: '10px' }}>{t('collection.tradeHistory')}</p>
              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '12px', textAlign: 'center', padding: '8px 0' }}>{t('collection.tradePending')}</p>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {selectedItem.dina_id && (
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '10px', fontFamily: 'monospace' }}>DINA: {selectedItem.dina_id}</span>
              )}
              <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '10px', fontFamily: 'monospace' }}>ASSET: {selectedItem.asset_id}</span>
            </div>
          </div>
        )}
        <div style={{ marginTop: 'auto', paddingBottom: 'max(60px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {selectedItem.dina_id && (
            <button onClick={() => handlePhysicalVerify(selectedItem)} style={{ width: '100%', padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa', cursor: 'pointer', fontWeight: '500' }}>
              정품인증 (카메라)
            </button>
          )}
          {selectedItem.ownership_status === 'CLAIMED' && (
            <button onClick={() => { if (!authToken) { navigateToScreen('login') } else { setShowSellModal(true) } }} style={{ width: '100%', padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24', cursor: 'pointer', fontWeight: '500' }}>
              {t('collection.sellButton')}
            </button>
          )}
          <button onClick={safeGoHome} style={{ width: '100%', padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>
            {t('collection.homeButton')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
        <button onClick={safeGoHome} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', marginRight: '12px' }}>
          <BackArrow />
        </button>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '500' }}>{t('collection.title')}</span>
        {!loading && !error && (
          <span style={{ marginLeft: 'auto', color: '#4ade80', fontSize: '13px', fontFamily: 'monospace' }}>{items.length}</span>
        )}
      </div>
      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '32px', height: '32px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>컬렉션 불러오는 중...</p>
          </div>
        </div>
      )}
      {!loading && error && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="rgba(248,113,113,0.4)" strokeWidth="1.5" />
            <path d="M12 8v5M12 16h.01" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', textAlign: 'center' }}>{error}</p>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontSize: '13px', cursor: 'pointer' }}>
            다시 시도
          </button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '0 20px' }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
            <circle cx="9" cy="10" r="2.5" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
            <path d="M3 17l5-4 4 3 3-2 6 3" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px', lineHeight: '1.6', marginBottom: '8px' }}>아직 인증된 카드가 없습니다.</p>
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '12px', lineHeight: '1.6' }}>정품 인증을 완료하면 내 컬렉션에 자동 저장됩니다.</p>
          </div>
          <button onClick={() => navigateToScreen('certSelect')} style={{ marginTop: '8px', padding: '12px 24px', borderRadius: '14px', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)', color: '#a78bfa', fontSize: '14px', fontWeight: '400', cursor: 'pointer', letterSpacing: '0.04em' }}>
            정품 인증하기
          </button>
        </div>
      )}
      {!loading && !error && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map(item => (
            <button key={item.asset_id} onClick={() => setSelectedItem(item)} style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left' }}>
              <CardThumbnail item={item} width={48} height={64} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '2px' }}>{getAgencyName(item)}</p>
                <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '14px', fontWeight: '500', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getSeriesName(item)}</p>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginBottom: '6px' }}>{getArtistName(item)}</p>
                <span style={{ color: '#4ade80', fontSize: '11px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: '4px', padding: '2px 6px' }}>{getStatusLabel(item)}</span>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default CollectionScreen
