import type { MainMenuScreenProps } from '../types/app.types'

// Auth UX 리팩 v2.0 (2026-06-22)
// UI/UX 리팩 v3.4 (2026-06-28) — 심볼 블록 + 리스트형 메뉴 고급화

const MainMenuScreen = ({
  navigateToScreen,
  onLogout,
}: MainMenuScreenProps) => {

  const menuItems = [
    {
      label: '정품 인증하기',
      sub: '카메라 촬영으로 정품 여부를 확인하세요.',
      onClick: () => navigateToScreen('certSelect'),
      primary: true,
      disabled: false,
    },
    {
      label: '내 컬렉션',
      sub: '정품으로 검증된 나만의 컬렉션.',
      onClick: () => navigateToScreen('myCollection'),
      primary: false,
      disabled: false,
    },
    {
      label: '판매등록',
      sub: '인증마크와 함께 안전하게 판매하기.',
      onClick: () => {},
      primary: false,
      disabled: true,
    },
    {
      label: '최초 구매 등록',
      sub: 'QR을 스캔해 내 컬렉션에 저장하세요.',
      onClick: () => navigateToScreen('qrScan'),
      primary: false,
      disabled: false,
    },
    {
      label: '인증 기록',
      sub: '내가 인증한 기록을 확인합니다.',
      onClick: () => navigateToScreen('records'),
      primary: false,
      disabled: false,
    },
  ]

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      padding: '0 24px',
      paddingTop: 'max(52px, env(safe-area-inset-top))',
      paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
      backgroundColor: '#0a0a0c',
      boxSizing: 'border-box',
    }}>

      {/* 상단: 브랜드 블록 + 설정 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '40px' }}>

        {/* 심볼 + 텍스트 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="32" height="36" viewBox="0 0 180 200">
            <defs>
              <radialGradient id="mbg" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#4c1d95" stopOpacity="0.6"/>
                <stop offset="100%" stopColor="#0a0a0c" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="mcg" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.8"/>
                <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"/>
              </radialGradient>
            </defs>
            <ellipse cx="90" cy="95" rx="85" ry="85" fill="url(#mbg)"/>
            <polygon points="90,18 148,51 148,117 90,150 32,117 32,51"
              fill="none" stroke="#3b0764" strokeWidth="16" strokeLinejoin="round"/>
            <polygon points="90,18 148,51 148,117 90,150 32,117 32,51"
              fill="none" stroke="#6d28d9" strokeWidth="8" strokeLinejoin="round" opacity="0.6"/>
            <polygon points="90,18 148,51 148,117 90,150 32,117 32,51"
              fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinejoin="round" opacity="0.95"/>
            <circle cx="90" cy="84" r="42" fill="url(#mcg)" opacity="0.35"/>
            <circle cx="90" cy="84" r="18" fill="#2e1065" opacity="0.9"/>
            <circle cx="90" cy="84" r="11" fill="#a78bfa" opacity="0.95"/>
            <circle cx="90" cy="84" r="5" fill="#ddd6fe"/>
            <circle cx="90" cy="84" r="2.5" fill="#ffffff"/>
          </svg>
          <div>
            <p style={{
              fontSize: '13px', fontWeight: '300',
              letterSpacing: '0.3em', color: 'rgba(167,139,250,0.7)',
              margin: '0 0 2px 0', textTransform: 'uppercase',
            }}>Legit Tag</p>
            <p style={{
              fontSize: '8px', fontWeight: '300',
              letterSpacing: '0.1em', color: 'rgba(124,58,237,0.4)',
              margin: '0', textTransform: 'uppercase',
            }}>Authentic Goods Gateway</p>
          </div>
        </div>

        {/* 설정 */}
        <button
          onClick={() => navigateToScreen('settings')}
          style={{
            background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.2)',
            fontSize: '18px', cursor: 'pointer',
            padding: '8px', lineHeight: 1,
          }}
          aria-label="설정"
        >
          ⚙
        </button>
      </div>

      {/* 메뉴 리스트 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>

        {menuItems.map((item, idx) => (
          <button
            key={idx}
            onClick={item.onClick}
            disabled={item.disabled}
            style={{
              width: '100%',
              padding: '16px 20px',
              borderRadius: '14px',
              background: item.primary
                ? 'rgba(167,139,250,0.07)'
                : 'transparent',
              border: item.primary
                ? '1px solid rgba(167,139,250,0.2)'
                : '1px solid transparent',
              cursor: item.disabled ? 'default' : 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
            }}
          >
            <div style={{
              fontSize: '15px',
              fontWeight: '300',
              letterSpacing: '0.03em',
              color: item.primary
                ? '#a78bfa'
                : item.disabled
                  ? 'rgba(255,255,255,0.15)'
                  : 'rgba(255,255,255,0.75)',
              lineHeight: 1.3,
            }}>
              {item.label}
            </div>
            <div style={{
              fontSize: '11px',
              color: item.primary
                ? 'rgba(234,179,8,0.6)'
                : item.disabled
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(255,255,255,0.25)',
              fontWeight: '300',
              letterSpacing: '0.01em',
            }}>
              {item.sub}
            </div>
          </button>
        ))}

        {/* 구분선 */}
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.04)', margin: '12px 0 8px' }} />

        {/* 로그아웃 — 텍스트 링크형 */}
        <button
          onClick={onLogout}
          style={{
            background: 'none', border: 'none',
            color: 'rgba(239,68,68,0.4)',
            fontSize: '13px', fontWeight: '300',
            letterSpacing: '0.03em',
            cursor: 'pointer', padding: '8px 20px',
            textAlign: 'left', width: '100%',
          }}
        >
          로그아웃
        </button>
      </div>

      {/* 하단 */}
      <p style={{
        color: 'rgba(255,255,255,0.08)',
        fontSize: '9px',
        letterSpacing: '0.2em',
        fontWeight: '300',
        margin: '24px 0 0',
        textTransform: 'uppercase',
        textAlign: 'center',
      }}>
        Powered by Artion
      </p>
    </div>
  )
}

export default MainMenuScreen
