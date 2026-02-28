import { useCallback } from 'react'
import { registerWithServer } from '../evidencePipeline'
import type { ResultScreenProps } from '../types/app.types'

const ResultScreen = ({
  safeGoHome,
  openGalleryPicker,
  scanMode,
  errorCode,
  verifyStatus,
  capturedImage,
  previewImage,
  matchScore,
  confidence,
  networkError,
  sessionToken,
  dinaId,
  nonce,
  registering,
  setRegistering,
  setRegisterStatus,
  setRegisterError,
  setScreen,
  setQrDetected,
  setQrData,
  setCapturedImage,
  setRecordInfo,
  setError,
  setProcessing,
  setVerifyStatus,
}: ResultScreenProps) => {
  const isCamera = scanMode === 'camera'
  const displayImage = capturedImage || previewImage

  // 상태별 설정 (Color → Icon → Text 우선순위)
  const getStatusConfig = () => {
    // 네트워크 에러
    if (networkError) {
      return {
        color: '#f87171',
        bgColor: 'rgba(248, 113, 113, 0.08)',
        title: '연결 오류',
        subtitle: '네트워크 연결을 확인해주세요.',
        icon: (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#f87171" strokeWidth="2.5" />
            <path d="M16 16l16 16M32 16l-16 16" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )
      }
    }

    // 에러 코드 기반 처리
    if (errorCode) {
      return {
        color: '#f87171',
        bgColor: 'rgba(248, 113, 113, 0.08)',
        title: '검증 실패',
        subtitle: '발급 데이터를 확인할 수 없습니다.',
        icon: (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#f87171" strokeWidth="2.5" />
            <path d="M16 16l16 16M32 16l-16 16" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )
      }
    }

    // VALID (Green) - 정품 확인
    if (verifyStatus === 'VALID') {
      return {
        color: '#4ade80',
        bgColor: 'rgba(74, 222, 128, 0.08)',
        title: '정품 확인',
        subtitle: '발급 데이터와 일치합니다.',
        icon: (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#4ade80" strokeWidth="2.5" />
            <path d="M14 24l7 7 13-13" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )
      }
    }

    // SUSPECT (Yellow) - 주의 필요
    if (verifyStatus === 'SUSPECT') {
      return {
        color: '#fbbf24',
        bgColor: 'rgba(251, 191, 36, 0.08)',
        title: '주의 필요',
        subtitle: '추가 확인이 필요합니다.',
        icon: (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#fbbf24" strokeWidth="2.5" />
            <path d="M24 14v14" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
            <circle cx="24" cy="35" r="2.5" fill="#fbbf24" />
          </svg>
        )
      }
    }

    // INVALID/UNKNOWN (Red) - 검증 실패
    return {
      color: '#f87171',
      bgColor: 'rgba(248, 113, 113, 0.08)',
      title: '검증 실패',
      subtitle: '발급 데이터를 확인할 수 없습니다.',
      icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" stroke="#f87171" strokeWidth="2.5" />
          <path d="M16 16l16 16M32 16l-16 16" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    }
  }

  const config = getStatusConfig()

  // 다시 촬영
  const handleRetry = useCallback(() => {
    setQrDetected(false)
    setQrData(null)
    setCapturedImage(null)
    setRecordInfo(null)
    setError(null)
    setProcessing(false)
    setVerifyStatus(null)
    if (isCamera) {
      setScreen('camera')
    } else {
      setScreen('home')
      setTimeout(() => openGalleryPicker(), 50)
    }
  }, [isCamera, openGalleryPicker, setQrDetected, setQrData, setCapturedImage, setRecordInfo, setError, setProcessing, setVerifyStatus, setScreen])

  // 등록 (VALID일 때만)
  const handleRegister = async () => {
    if (!sessionToken || !dinaId || !nonce) return
    setRegistering(true)
    try {
      const res = await registerWithServer(sessionToken, dinaId, nonce)
      setRegisterStatus(res.status)
      if (!res.success) setRegisterError(res.error_code || res.error || 'UNKNOWN')
      setScreen('registerResult')
    } catch (e) {
      setRegisterStatus('FAILED')
      setRegisterError('NETWORK_ERROR')
      setScreen('registerResult')
    }
    setRegistering(false)
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', overflow: 'hidden' }}>

      {/* 상단: 촬영 이미지 (Freeze) */}
      <div style={{ height: '45%', position: 'relative', overflow: 'hidden' }}>
        {displayImage && (
          <img
            src={displayImage}
            alt="captured"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        {/* 그라데이션 오버레이 */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '80px',
          background: 'linear-gradient(to top, #0a0a0c, transparent)'
        }} />
      </div>

      {/* 결과 영역 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 24px', paddingTop: '8px' }}>

        {/* 상태 표시 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: config.bgColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {config.icon}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{
              color: config.color,
              fontSize: '24px',
              fontWeight: '600',
              marginBottom: '4px',
              letterSpacing: '-0.02em'
            }}>
              {config.title}
            </h2>
            <p style={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: '14px',
              lineHeight: '1.4'
            }}>
              {config.subtitle}
            </p>
          </div>
        </div>

        {/* 상세 정보 */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px'
        }}>
          {/* DINA 코드 */}
          {dinaId && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>DINA</span>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{dinaId}</span>
            </div>
          )}

          {/* 일치율 */}
          {matchScore !== null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>일치율</span>
              <span style={{ color: config.color, fontSize: '13px', fontWeight: '600' }}>{(matchScore * 100).toFixed(1)}%</span>
            </div>
          )}

          {/* 신뢰도 */}
          {confidence !== null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>신뢰도</span>
              <span style={{ color: config.color, fontSize: '13px', fontWeight: '600' }}>{confidence}%</span>
            </div>
          )}

          {/* 정보가 없을 때 */}
          {!dinaId && matchScore === null && confidence === null && (
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', textAlign: 'center', margin: 0 }}>
              상세 정보 없음
            </p>
          )}
        </div>

        {/* 면책 문구 */}
        <p style={{
          color: 'rgba(255,255,255,0.25)',
          fontSize: '10px',
          textAlign: 'center',
          lineHeight: '1.5',
          marginBottom: '16px'
        }}>
          GeoCam은 공식 발급 기록을 기반으로 검증 정보를 제공합니다.
        </p>

        {/* 하단 버튼 */}
        <div style={{ marginTop: 'auto', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          {/* VALID일 때 등록 버튼 */}
          {verifyStatus === 'VALID' && sessionToken && (
            <button
              onClick={handleRegister}
              disabled={registering}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '14px',
                fontSize: '16px',
                fontWeight: '600',
                background: registering ? 'rgba(74,222,128,0.3)' : 'rgba(74,222,128,0.15)',
                border: 'none',
                color: '#4ade80',
                cursor: registering ? 'default' : 'pointer',
                marginBottom: '12px'
              }}
            >
              {registering ? '등록 중...' : '등록'}
            </button>
          )}

          {/* 다시 촬영 + 홈 */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleRetry}
              style={{
                flex: 1,
                padding: '16px',
                borderRadius: '14px',
                fontSize: '15px',
                fontWeight: '500',
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                color: 'rgba(255,255,255,0.9)',
                cursor: 'pointer'
              }}
            >
              다시 촬영
            </button>
            <button
              onClick={safeGoHome}
              style={{
                flex: 1,
                padding: '16px',
                borderRadius: '14px',
                fontSize: '15px',
                fontWeight: '400',
                background: 'rgba(255,255,255,0.03)',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer'
              }}
            >
              홈
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ResultScreen
