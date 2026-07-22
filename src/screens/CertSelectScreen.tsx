import type { CertSelectScreenProps } from '../types/app.types'

// UI/UX 리팩 v3.5 (2026-06-28)
// 서브 텍스트 → 옐로우(--color-inconclusive) 적용
// v3.6 (2026-06-30) — LC-CAM-001 v5.2 §5 #1: 실물 탭 QR 생략 버그 수정 ('camera' 직행 → qrScan 복원)
// v3.7 (2026-07-22) — LT-AUTOCAP-002: sizeSelect 폐기, 'camera' 직행으로 변경. 안내문구도 수정.

const CertSelectScreen = ({
  safeGoHome,
  BackArrow,
  navigateToScreen,
  openGalleryPicker,
}: CertSelectScreenProps) => {

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0a0a0c',
      padding: '0 24px',
      paddingTop: 'max(56px, env(safe-area-inset-top))',
      paddingBottom: 'max(48px, env(safe-area-inset-bottom))',
      boxSizing: 'border-box',
    }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '40px' }}>
        <button
          onClick={safeGoHome}
          style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', marginRight: '16px',
          }}
        >
          <BackArrow />
        </button>
        <h2 style={{
          color: 'rgba(255,255,255,0.88)',
          fontSize: '17px',
          fontWeight: '300',
          margin: 0,
          letterSpacing: '0.03em',
        }}>
          정품 인증하기
        </h2>
      </div>

      {/* 안내 문구 */}
      <div style={{ marginBottom: '32px' }}>
        <p style={{
          color: 'rgba(255,255,255,0.5)',
          fontSize: '13px',
          fontWeight: '300',
          lineHeight: '1.6',
          letterSpacing: '0.01em',
        }}>
          인증 방식을 선택하세요.
        </p>
      </div>

      {/* 탭 1 — 굿즈 정품 인증 */}
      <button
        onClick={() => navigateToScreen('camera')}
        style={{
          width: '100%',
          padding: '28px 22px',
          borderRadius: '18px',
          background: 'rgba(167,139,250,0.08)',
          border: '1px solid rgba(167,139,250,0.3)',
          cursor: 'pointer',
          textAlign: 'center',
          marginBottom: '12px',
          boxShadow: '0 0 32px rgba(167,139,250,0.06), inset 0 1px 0 rgba(167,139,250,0.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <div style={{
          fontSize: '11px',
          letterSpacing: '0.12em',
          color: 'rgba(167,139,250,0.5)',
          fontWeight: '400',
          textTransform: 'uppercase',
        }}>
          Physical
        </div>
        <div style={{
          fontSize: '18px',
          fontWeight: '400',
          color: '#a78bfa',
          letterSpacing: '0.04em',
        }}>
          굿즈 정품 인증
        </div>
        <div style={{
          fontSize: '12px',
          color: 'rgba(234,179,8,0.75)',
          fontWeight: '300',
          lineHeight: '1.6',
          textAlign: 'center',
        }}>
          지오캠 촬영으로 정품인증 하세요.
        </div>
      </button>

      {/* 탭 2 — 디지털 굿즈 정품 인증 */}
      <div style={{
        width: '100%',
        padding: '28px 22px',
        borderRadius: '18px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
      }}>
        <div style={{
          fontSize: '11px',
          letterSpacing: '0.12em',
          color: 'rgba(255,255,255,0.25)',
          fontWeight: '400',
          textTransform: 'uppercase',
        }}>
          Digital
        </div>
        <div style={{
          fontSize: '18px',
          fontWeight: '400',
          color: '#a78bfa',
          letterSpacing: '0.04em',
          marginBottom: '8px',
        }}>
          디지털 굿즈 정품 인증
        </div>

        {/* 디지털 서브 버튼 2개 */}
        <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
          <button
            onClick={openGalleryPicker}
            style={{
              flex: 1,
              padding: '16px',
              borderRadius: '14px',
              background: 'rgba(167,139,250,0.06)',
              border: '1px solid rgba(167,139,250,0.2)',
              cursor: 'pointer',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <div style={{
              fontSize: '14px',
              color: '#a78bfa',
              fontWeight: '400',
              letterSpacing: '0.03em',
            }}>
              갤러리
            </div>
            <div style={{
              fontSize: '11px',
              color: 'rgba(234,179,8,0.75)',
              fontWeight: '300',
            }}>
              이미지 파일 선택
            </div>
          </button>

          <button
            onClick={() => navigateToScreen('myCollection')}
            style={{
              flex: 1,
              padding: '16px',
              borderRadius: '14px',
              background: 'rgba(167,139,250,0.06)',
              border: '1px solid rgba(167,139,250,0.2)',
              cursor: 'pointer',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <div style={{
              fontSize: '14px',
              color: '#a78bfa',
              fontWeight: '400',
              letterSpacing: '0.03em',
            }}>
              내 컬렉션
            </div>
            <div style={{
              fontSize: '11px',
              color: 'rgba(234,179,8,0.75)',
              fontWeight: '300',
            }}>
              보유 자산 확인
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

export default CertSelectScreen