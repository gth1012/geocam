import { useEffect, useState } from 'react'
import type { CollectionScreenProps } from '../types/app.types'

const NEO_API_BASE = 'https://neo-api.artionchain.com/api'
const CDN_BASE     = 'https://cdn.artionchain.com'

interface OwnershipItem {
  asset_id:          string
  owner_id:          string
  ownership_status:  string
  claimed_at:        string
  dina_id:           string
  series_id:         string
  series_name:       string
  artist_name:       string
  agency_name:       string
  status_label:      string
  display_image_key: string | null
}

const CollectionScreen = ({ safeGoHome, BackArrow, authToken, navigateToScreen, setDinaId }: CollectionScreenProps) => {
  const [items, setItems]         = useState<OwnershipItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<OwnershipItem | null>(null)

  useEffect(() => {
    const fetchCollection = async () => {
      setLoading(true)
      setError(null)
      try {
        if (!authToken) {
          setError('로그인이 필요합니다.')
          return
        }
        const res = await fetch(`${NEO_API_BASE}/geocam/ownership/me`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        })
        if (!res.ok) {
          setError('서버 응답 오류가 발생했습니다.')
          return
        }
        const data = await res.json()
        if (!data.success) {
          setError('컬렉션 데이터를 불러오지 못했습니다.')
          return
        }
        setItems(data.items || [])
      } catch {
        setError('네트워크 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }
    fetchCollection()
  }, [authToken])

  const getImageUrl = (key: string | null): string | null => {
    if (!key) return null
    return `${CDN_BASE}/${key}`
  }

  // 상세 화면
  if (selectedItem) {
    const imageUrl = getImageUrl(selectedItem.display_image_key)
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0c', color: '#fff', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={() => setSelectedItem(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer', marginRight: '12px' }}>
            ←
          </button>
          <span style={{ fontSize: '16px', fontWeight: 500 }}>포카 상세</span>
        </div>

        <div style={{ margin: '20px', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#1a1a1c', aspectRatio: '55/85', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {imageUrl ? (
            <img src={imageUrl} alt="포카 이미지" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '14px' }}>이미지 없음</div>
          )}
        </div>

        <div style={{ margin: '0 20px', backgroundColor: '#1a1a1c', borderRadius: '16px', padding: '20px' }}>
          {[
            { label: '기획사',   value: selectedItem.agency_name  || '-' },
            { label: '시리즈',   value: selectedItem.series_name  || '-' },
            { label: '아티스트', value: selectedItem.artist_name  || '-' },
            { label: '상태',     value: selectedItem.status_label || selectedItem.ownership_status || '-' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>{label}</span>
              <span style={{ color: label === '상태' ? '#7c6af7' : '#fff', fontSize: '14px' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 목록 화면
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0c', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {BackArrow && <BackArrow />}
        <span style={{ fontSize: '16px', fontWeight: 500, marginLeft: '8px' }}>내 컬렉션</span>
        {items.length > 0 && (
          <span style={{ marginLeft: 'auto', color: '#7c6af7', fontSize: '14px' }}>{items.length}</span>
        )}
      </div>

      <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: 'rgba(255,255,255,0.4)' }}>
            불러오는 중...
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '40px 20px' }}>
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '40px 20px' }}>
            등록된 포카가 없습니다.
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map((item) => {
              const imageUrl = getImageUrl(item.display_image_key)
              return (
                <div
                  key={item.asset_id}
                  onClick={() => setSelectedItem(item)}
                  style={{ backgroundColor: '#1a1a1c', borderRadius: '12px', padding: '12px', display: 'flex', gap: '12px', alignItems: 'center', cursor: 'pointer' }}
                >
                  <div style={{ width: '60px', height: '85px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#2a2a2c', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {imageUrl ? (
                      <img src={imageUrl} alt="포카" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '20px', opacity: 0.3 }}>🃏</span>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>{item.agency_name || '-'}</div>
                    <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>{item.artist_name || item.dina_id}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>{item.series_name || '-'}</div>
                    <span style={{ fontSize: '11px', color: '#7c6af7', border: '1px solid #7c6af7', borderRadius: '4px', padding: '2px 6px' }}>
                      {item.status_label || item.ownership_status}
                    </span>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '18px' }}>›</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default CollectionScreen
