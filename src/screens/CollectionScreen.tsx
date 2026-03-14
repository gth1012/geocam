import { useState } from 'react'
import type { CollectionScreenProps } from '../types/app.types'

const API_BASE = 'https://neo-studio-api-production.up.railway.app/api';

interface CollectionItem {
  asset_id: string;
  dina_id: string;
  series_name: string;
  artist_name: string;
  agency_name: string;
  edition: number;
  total_edition: number;
  issued_at: string;
  claimed_at: string;
  marketplace_status: string;
}

// 목업 데이터 (API 연동 전까지 사용)
const MOCK_COLLECTION: CollectionItem[] = [
  { asset_id: '1', dina_id: 'DINA-A1B2C3D4', agency_name: 'HYBE', series_name: '이제하 삽화 시리즈', artist_name: '이제하', edition: 1, total_edition: 300, issued_at: '2026-03-01T09:00:00Z', claimed_at: '2026-03-11T09:00:00Z', marketplace_status: 'SELLABLE' },
  { asset_id: '2', dina_id: 'DINA-E5F6G7H8', agency_name: 'HYBE', series_name: '이제하 삽화 시리즈', artist_name: '이제하', edition: 3, total_edition: 300, issued_at: '2026-03-01T09:00:00Z', claimed_at: '2026-03-10T14:30:00Z', marketplace_status: 'SELLABLE' },
  { asset_id: '3', dina_id: 'DINA-I9J0K1L2', agency_name: 'HYBE', series_name: '이제하 삽화 시리즈', artist_name: '이제하', edition: 7, total_edition: 300, issued_at: '2026-03-01T09:00:00Z', claimed_at: '2026-03-09T11:00:00Z', marketplace_status: 'LISTED' },
]

const CollectionScreen = ({ safeGoHome, BackArrow, authToken, setScreen }: CollectionScreenProps) => {
  const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [showSellModal, setShowSellModal] = useState(false)
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [selling, setSelling] = useState(false)
  const [sellError, setSellError] = useState<string | null>(null)
  const [sellSuccess, setSellSuccess] = useState(false)

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  const getStatusInfo = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      SELLABLE: { label: '판매 가능', color: '#4ade80' },
      LISTED: { label: '판매 중', color: '#fbbf24' },
      SOLD: { label: '판매 완료', color: 'rgba(255,255,255,0.3)' },
    }
    return map[status] || { label: status, color: 'rgba(255,255,255,0.3)' }
  }

  const handleSell = async () => {
    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      setSellError('올바른 가격을 입력해 주세요.')
      return
    }
    if (!authToken) {
      setSellError('로그인이 필요합니다.')
      return
    }

    setSelling(true)
    setSellError(null)

    try {
      const res = await fetch(`${API_BASE}/market/listings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          asset_id: selectedItem?.asset_id,
          price: Number(price),
          currency: 'KRW',
          description: description || undefined,
        }),
      })
      const data = await res.json()

      if (!data.success) {
        setSellError(data.error?.message || '판매 등록에 실패했습니다.')
        return
      }

      setSellSuccess(true)
      // 상태 업데이트
      if (selectedItem) {
        selectedItem.marketplace_status = 'LISTED'
      }
    } catch (e) {
      setSellError('네트워크 오류가 발생했습니다.')
    } finally {
      setSelling(false)
    }
  }

  const labelStyle = { color: '#a78bfa', fontSize: '12px' }
  const valueStyle = { color: 'rgba(255,255,255,0.85)', fontSize: '14px' }

  // 판매하기 모달
  if (showSellModal && selectedItem) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))', paddingBottom: 'max(40px, env(safe-area-inset-bottom))', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px' }}>
          <button onClick={() => { setShowSellModal(false); setSellError(null); setPrice(''); setDescription(''); setSellSuccess(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', marginRight: '12px' }}>
            <BackArrow />
          </button>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '500' }}>판매 등록</span>
        </div>

        {sellSuccess ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(74,222,128,0.1)', border: '2px solid rgba(74,222,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
              <svg width="36" height="36" viewBox="0 0 48 48" fill="none">
                <path d="M15 24l6 6 12-12" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p style={{ color: '#4ade80', fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>판매 등록 완료!</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginBottom: '32px' }}>{Number(price).toLocaleString()}원에 등록됐어요</p>
            <button onClick={() => { setShowSellModal(false); setSellSuccess(false); setPrice(''); setDescription(''); }} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: '15px', cursor: 'pointer' }}>
              컬렉션으로 돌아가기
            </button>
          </div>
        ) : (
          <>
            {/* 자산 정보 요약 */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '4px' }}>{selectedItem.agency_name}</p>
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '15px', fontWeight: '500', marginBottom: '4px' }}>{selectedItem.series_name}</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>{selectedItem.artist_name} · #{selectedItem.edition}</p>
            </div>

            {/* 가격 입력 */}
            <div style={{ marginBottom: '16px' }}>
              <p style={{ color: '#a78bfa', fontSize: '12px', marginBottom: '8px' }}>판매 가격 (KRW)</p>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  placeholder="0"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  style={{ width: '100%', padding: '14px', paddingRight: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
                />
                <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>원</span>
              </div>
              {price && !isNaN(Number(price)) && (
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', marginTop: '6px' }}>{Number(price).toLocaleString()}원</p>
              )}
            </div>

            {/* 설명 입력 */}
            <div style={{ marginBottom: '24px' }}>
              <p style={{ color: '#a78bfa', fontSize: '12px', marginBottom: '8px' }}>설명 (선택)</p>
              <textarea
                placeholder="판매 관련 설명을 입력하세요"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: '14px', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            {sellError && (
              <p style={{ color: '#f87171', fontSize: '13px', marginBottom: '16px', textAlign: 'center' }}>{sellError}</p>
            )}

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={handleSell}
                disabled={selling}
                style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24', fontSize: '15px', fontWeight: '500', cursor: 'pointer', opacity: selling ? 0.5 : 1 }}
              >
                {selling ? '등록 중...' : '판매 등록'}
              </button>
              <button
                onClick={() => { setShowSellModal(false); setSellError(null); setPrice(''); setDescription(''); }}
                style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: '15px', cursor: 'pointer' }}
              >
                취소
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  // 상세 화면
  if (selectedItem) {
    const statusInfo = getStatusInfo(selectedItem.marketplace_status)
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
          <button onClick={() => { setSelectedItem(null); setShowMore(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', marginRight: '12px' }}>
            <BackArrow />
          </button>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '500' }}>포카 상세</span>
        </div>

        {/* 이미지 */}
        <div style={{ width: '100%', aspectRatio: '3/4', background: 'rgba(255,255,255,0.05)', borderRadius: '16px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
            <circle cx="9" cy="10" r="2.5" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
            <path d="M3 17l5-4 4 3 3-2 6 3" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </div>

        {/* 메인 정보 */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={labelStyle}>기획사</span>
            <span style={valueStyle}>{selectedItem.agency_name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={labelStyle}>시리즈</span>
            <span style={valueStyle}>{selectedItem.series_name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={labelStyle}>아티스트</span>
            <span style={valueStyle}>{selectedItem.artist_name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={labelStyle}>상태</span>
            <span style={{ color: statusInfo.color, fontSize: '14px', fontWeight: '500' }}>{statusInfo.label}</span>
          </div>
        </div>

        {/* 더보기 */}
        <button
          onClick={() => setShowMore(!showMore)}
          style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', color: 'rgba(255,255,255,0.5)', fontSize: '13px', cursor: 'pointer', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          {showMore ? '접기 ▲' : '더보기 ▼'}
        </button>

        {showMore && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <p style={{ color: '#a78bfa', fontSize: '11px', letterSpacing: '0.08em', marginBottom: '10px' }}>에디션 정보</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>에디션 번호</span>
                  <span style={{ color: '#4ade80', fontSize: '13px', fontFamily: 'monospace' }}>#{selectedItem.edition} / {selectedItem.total_edition}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>발행일</span>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>{formatDate(selectedItem.issued_at)}</span>
                </div>
              </div>
            </div>
            <div>
              <p style={{ color: '#a78bfa', fontSize: '11px', letterSpacing: '0.08em', marginBottom: '10px' }}>인증 정보</p>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>최초 등록일</span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>{formatDate(selectedItem.claimed_at)}</span>
              </div>
            </div>
            <div>
              <p style={{ color: '#a78bfa', fontSize: '11px', letterSpacing: '0.08em', marginBottom: '10px' }}>거래 내역</p>
              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '12px', textAlign: 'center', padding: '8px 0' }}>준비 중</p>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '12px' }}>
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '10px', fontFamily: 'monospace' }}>DINA: {selectedItem.dina_id}</span>
            </div>
          </div>
        )}

        {/* 하단 버튼 */}
        <div style={{ marginTop: 'auto', paddingBottom: 'max(60px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {selectedItem.marketplace_status === 'SELLABLE' && (
            <button
              onClick={() => {
                if (!authToken) {
                  setScreen('login')
                } else {
                  setShowSellModal(true)
                }
              }}
              style={{ width: '100%', padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24', cursor: 'pointer', fontWeight: '500' }}
            >
              판매하기
            </button>
          )}
          <button
            onClick={safeGoHome}
            style={{ width: '100%', padding: '14px', borderRadius: '12px', fontSize: '15px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}
          >
            홈으로
          </button>
        </div>
      </div>
    )
  }

  // 목록 화면
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
        <button onClick={safeGoHome} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', marginRight: '12px' }}>
          <BackArrow />
        </button>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '500' }}>내 컬렉션</span>
        <span style={{ marginLeft: 'auto', color: '#4ade80', fontSize: '13px', fontFamily: 'monospace' }}>{MOCK_COLLECTION.length}개</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {MOCK_COLLECTION.map(item => {
          const statusInfo = getStatusInfo(item.marketplace_status)
          return (
            <button
              key={item.asset_id}
              onClick={() => setSelectedItem(item)}
              style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left' }}
            >
              <div style={{ width: '48px', height: '64px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
                  <circle cx="9" cy="10" r="2.5" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
                  <path d="M3 17l5-4 4 3 3-2 6 3" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '2px' }}>{item.agency_name}</p>
                <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '14px', fontWeight: '500', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.series_name}</p>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginBottom: '6px' }}>{item.artist_name} · #{item.edition}</p>
                <span style={{ color: statusInfo.color, fontSize: '11px', background: `${statusInfo.color}15`, border: `1px solid ${statusInfo.color}30`, borderRadius: '4px', padding: '2px 6px' }}>{statusInfo.label}</span>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default CollectionScreen
