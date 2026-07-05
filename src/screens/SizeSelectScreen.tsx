// SizeSelectScreen.tsx
// LC-CAM-001 v3.3 — 카드 사이즈 선택 화면
// 작성: 짱아 / 2026-06-28

import { useState, useEffect, useCallback } from 'react'
import { Preferences } from '@capacitor/preferences'
import type { SizeSelectScreenProps, CardProfile } from '../types/app.types'
import { CARD_PROFILES, DEFAULT_CARD_PROFILE } from '../types/app.types'

const PREFS_KEY = 'legittag_last_card_profile_id'

const SizeSelectScreen = ({
  safeGoHome,
  BackArrow,
  onProfileSelected,
}: SizeSelectScreenProps) => {
  const [selected, setSelected] = useState<CardProfile>(DEFAULT_CARD_PROFILE)
  const [loading, setLoading] = useState(true)

  // 마지막 선택 사이즈 복원 (Capacitor Preferences 우선)
  useEffect(() => {
    const loadSaved = async () => {
      try {
        const { value } = await Preferences.get({ key: PREFS_KEY })
        if (value) {
          const found = CARD_PROFILES.find(p => p.id === value)
          if (found) setSelected(found)
        } else {
          // localStorage fallback
          const lsVal = localStorage.getItem(PREFS_KEY)
          if (lsVal) {
            const found = CARD_PROFILES.find(p => p.id === lsVal)
            if (found) setSelected(found)
          }
        }
      } catch {
        // Preferences 실패 시 localStorage fallback
        try {
          const lsVal = localStorage.getItem(PREFS_KEY)
          if (lsVal) {
            const found = CARD_PROFILES.find(p => p.id === lsVal)
            if (found) setSelected(found)
          }
        } catch { /* 무시 */ }
      } finally {
        setLoading(false)
      }
    }
    loadSaved()
  }, [])

  const handleSelect = useCallback((profile: CardProfile) => {
    setSelected(profile)
  }, [])

  const handleNext = useCallback(async () => {
    // 선택값 저장 (Capacitor Preferences 우선)
    try {
      await Preferences.set({ key: PREFS_KEY, value: selected.id })
    } catch {
      try { localStorage.setItem(PREFS_KEY, selected.id) } catch { /* 무시 */ }
    }
    onProfileSelected(selected)
  }, [selected, onProfileSelected])

  // 비율 미리보기 박스 크기 계산
  const previewH = 56
  const previewW = Math.round(previewH / selected.aspectHOverW)

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: '#0a0a0c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>불러오는 중...</div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#0a0a0c', display: 'flex', flexDirection: 'column' }}>

      {/* 헤더 */}
      <div style={{ padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={safeGoHome}
          style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <BackArrow />
        </button>
        <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '14px', fontWeight: '300', letterSpacing: '0.12em' }}>
          카드 사이즈 선택
        </span>
      </div>

      {/* 타이틀 */}
      <div style={{ padding: '8px 24px 24px' }}>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', letterSpacing: '0.15em', marginBottom: '6px' }}>
          CARD SIZE
        </p>
        <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '20px', fontWeight: '200', letterSpacing: '0.04em' }}>
          카드 종류를 선택하세요
        </h2>
      </div>

      {/* 카드 목록 */}
      <div style={{ flex: 1, padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
        {CARD_PROFILES.map((profile) => {
          const isSelected = profile.id === selected.id
          const pH = 52
          const pW = Math.round(pH / profile.aspectHOverW)

          return (
            <button
              key={profile.id}
              onClick={() => handleSelect(profile)}
              style={{
                width: '100%',
                padding: '16px 18px',
                borderRadius: '14px',
                background: isSelected ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.03)',
                border: isSelected
                  ? '1px solid rgba(74,222,128,0.35)'
                  : '1px solid rgba(255,255,255,0.07)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                textAlign: 'left',
              }}
            >
              {/* 비율 미리보기 */}
              <div style={{
                width: `${pW}px`,
                height: `${pH}px`,
                borderRadius: '4px',
                background: isSelected ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.06)',
                border: isSelected ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.12)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <div style={{
                  width: `${Math.round(pW * 0.5)}px`,
                  height: `${Math.round(pH * 0.5)}px`,
                  borderRadius: '2px',
                  background: isSelected ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)',
                }} />
              </div>

              {/* 텍스트 */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{
                    color: isSelected ? '#4ade80' : 'rgba(255,255,255,0.85)',
                    fontSize: '15px',
                    fontWeight: isSelected ? '400' : '300',
                  }}>
                    {profile.name}
                  </span>
                  {profile.id === 'GOODS' && (
                    <span style={{ fontSize: '10px', color: 'rgba(74,222,128,0.7)', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: '4px', padding: '1px 6px', letterSpacing: '0.05em' }}>
                      기본
                    </span>
                  )}
                </div>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', fontWeight: '300' }}>
                  {profile.widthMm} × {profile.heightMm} mm
                </span>
              </div>

              {/* 선택 표시 */}
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: isSelected ? 'rgba(74,222,128,0.2)' : 'transparent',
                border: isSelected ? '1.5px solid #4ade80' : '1.5px solid rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {isSelected && (
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80' }} />
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* 선택된 사이즈 미리보기 */}
      <div style={{ padding: '20px 24px 12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <div style={{
            width: `${previewW}px`,
            height: `${previewH}px`,
            borderRadius: '4px',
            background: 'rgba(74,222,128,0.1)',
            border: '1px solid rgba(74,222,128,0.3)',
            flexShrink: 0,
          }} />
          <div>
            <p style={{ color: '#4ade80', fontSize: '13px', fontWeight: '400', marginBottom: '2px' }}>
              {selected.name}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>
              {selected.widthMm} × {selected.heightMm} mm
            </p>
          </div>
        </div>
      </div>

      {/* 다음 버튼 */}
      <div style={{ padding: '8px 20px', paddingBottom: 'max(28px, env(safe-area-inset-bottom))' }}>
        <button
          onClick={handleNext}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '14px',
            background: 'rgba(74,222,128,0.1)',
            border: '1px solid rgba(74,222,128,0.25)',
            color: '#4ade80',
            fontSize: '15px',
            fontWeight: '400',
            letterSpacing: '0.06em',
            cursor: 'pointer',
          }}
        >
          다음 — 촬영 시작
        </button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default SizeSelectScreen
