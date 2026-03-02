import { useState, useRef, useCallback } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'
import { API_BASE_URL } from '../api/client'
import type { ScanScreenProps } from '../types/app.types'

const ScanScreen = ({
  safeGoHome,
  BackArrow,
  t,
  setQrData,
  setQrDetected,
  setProcessing,
  setNetworkError,
  setErrorCode,
  setDinaId,
  setScanResultInfo,
  setScreen,
  cameraError,
  setCameraError,
}: ScanScreenProps) => {
  const [localProcessing, setLocalProcessing] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)
  const scanLockRef = useRef(false)

  // QR스캔 → 정품인증 플로우: GET /status/:dinaId로 상태 조회
  const checkDinaStatus = async (dinaCode: string) => {
    setProcessing(true)
    setNetworkError(false)
    setErrorCode(null)
    setDinaId(dinaCode)

    try {
      console.log('[QR SCAN] Status check:', `${API_BASE_URL}/geocam/status/${dinaCode}`)

      const response = await fetch(`${API_BASE_URL}/geocam/status/${dinaCode}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        if (response.status === 404) {
          // DINA ID가 NeoStudio에 없음 = 미등록
          setScanResultInfo({ status: 'ERROR', message: t('error.dinaNotFound') || '등록되지 않은 제품입니다.' })
        } else if (response.status >= 500) {
          setNetworkError(true)
          setScanResultInfo({ status: 'ERROR', message: t('error.server') || '서버 오류가 발생했습니다.' })
        } else if (response.status === 429) {
          setErrorCode('RATE_LIMIT_EXCEEDED')
          setScanResultInfo({ status: 'ERROR', message: t('error.rateLimit') || '요청이 너무 많습니다.' })
        } else {
          setScanResultInfo({ status: 'ERROR', message: t('error.network') || '네트워크 오류가 발생했습니다.' })
        }
        setProcessing(false)
        setScreen('scanResult')
        return
      }

      const result = await response.json()
      console.log('[QR SCAN] Status response:', result)

      // 상태에 따라 scanResultInfo 설정
      if (result.status === 'UNCLAIMED') {
        setScanResultInfo({
          status: 'UNCLAIMED',
          message: result.series_id || undefined,
        })
      } else if (result.status === 'CLAIMED') {
        setScanResultInfo({
          status: 'CLAIMED',
          message: undefined,
        })
      } else {
        // UNREGISTERED 등 기타 상태
        setScanResultInfo({
          status: 'ERROR',
          message: t('error.dinaNotFound') || '등록되지 않은 제품입니다.',
        })
      }

      setDinaId(result.dina_id || dinaCode)
      setProcessing(false)
      setScanning(false)
      setTimeout(() => {
        setScreen('scanResult')
      }, 300)

    } catch (err) {
      console.log('[QR SCAN] Error:', err)
      console.error('status check error:', err)
      setNetworkError(true)
      setScanResultInfo({ status: 'ERROR', message: t('error.network') || '네트워크 오류가 발생했습니다.' })
      setProcessing(false)
      setScreen('scanResult')
    }
  }

  // QR 스캔 성공 시 처리
  const handleQrDetected = useCallback(async (result: any) => {
    // 중복 스캔 방지 (useRef + localProcessing 이중 가드)
    if (scanLockRef.current || localProcessing) return

    if (result && result[0]?.rawValue) {
      const data = result[0].rawValue
      if (data.includes('DINA-') || /^[A-Z0-9]{8,16}$/.test(data.trim())) {
        // 스캔 락 설정
        scanLockRef.current = true
        setLocalProcessing(true)
        setQrData(data)
        setQrDetected(true)

        // DINA 코드 추출 (접두사 제거)
        const dinaMatch = data.match(/DINA-([A-Z0-9]{8,16})/)
        const dinaCode = dinaMatch ? dinaMatch[1] : (/^[A-Z0-9]{8,16}$/.test(data.trim()) ? data.trim() : null)

        if (dinaCode) {
          await checkDinaStatus(dinaCode)
        } else {
          setScanError(t('scan.invalid'))
          setTimeout(() => setScanError(null), 2000)
          scanLockRef.current = false
          setLocalProcessing(false)
        }
      } else {
        setScanError(t('scan.invalid'))
        setTimeout(() => setScanError(null), 2000)
      }
    }
  }, [localProcessing, t, setQrData, setQrDetected])

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* 헤더 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={safeGoHome} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <BackArrow />
        </button>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', letterSpacing: '0.1em' }}>{t('scan.title')}</span>
        <div style={{ width: '40px' }} />
      </div>

      {/* 카메라 영역 - Scanner 사용 */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div id="scan-scanner" style={{ position: 'absolute', inset: 0 }}>
          {scanning && (
            <Scanner
              onScan={handleQrDetected}
              constraints={{ facingMode: 'environment' }}
              styles={{
                container: { width: '100%', height: '100%' },
                video: { width: '100%', height: '100%', objectFit: 'cover' }
              }}
              onError={(err) => {
                console.error('Scanner error:', err)
                setCameraError(t('camera.error'))
              }}
            />
          )}
        </div>

        {/* 카메라 에러 표시 */}
        {cameraError && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: '#0a0a0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <p style={{ color: '#f87171', fontSize: '16px', marginBottom: '12px' }}>{t('camera.error')}</p>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', textAlign: 'center', marginBottom: '24px' }}>{cameraError}</p>
            <button onClick={safeGoHome} style={{ padding: '12px 24px', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer' }}>{t('common.home')}</button>
          </div>
        )}

        {/* 스캔 영역 가이드 */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '240px', height: '240px', zIndex: 10, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '50px', height: '50px', borderTop: '4px solid #60a5fa', borderLeft: '4px solid #60a5fa', borderTopLeftRadius: '16px' }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: '50px', height: '50px', borderTop: '4px solid #60a5fa', borderRight: '4px solid #60a5fa', borderTopRightRadius: '16px' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '50px', height: '50px', borderBottom: '4px solid #60a5fa', borderLeft: '4px solid #60a5fa', borderBottomLeftRadius: '16px' }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: '50px', height: '50px', borderBottom: '4px solid #60a5fa', borderRight: '4px solid #60a5fa', borderBottomRightRadius: '16px' }} />
        </div>

        {/* 에러 메시지 */}
        {scanError && (
          <div style={{ position: 'absolute', top: '25%', left: '50%', transform: 'translateX(-50%)', padding: '12px 24px', background: 'rgba(248,113,113,0.9)', borderRadius: '12px', zIndex: 30 }}>
            <p style={{ color: 'white', fontSize: '14px', margin: 0 }}>{scanError}</p>
          </div>
        )}

        {/* 처리 중 표시 */}
        {localProcessing && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '16px 32px', background: 'rgba(0,0,0,0.8)', borderRadius: '12px', zIndex: 20 }}>
            <p style={{ color: '#60a5fa', fontSize: '16px', margin: 0 }}>{t('scan.processing')}...</p>
          </div>
        )}
      </div>

      {/* 하단 안내 */}
      <div style={{ padding: '24px', paddingBottom: 'max(60px, env(safe-area-inset-bottom))', textAlign: 'center', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', position: 'relative', zIndex: 10 }}>
        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>
          {t('scan.title')}
        </p>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0 }}>
          {t('scan.guide')}
        </p>
      </div>

      {/* Scanner video 스타일 오버라이드 */}
      <style>{`
        #scan-scanner video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
      `}</style>
    </div>
  )
}

export default ScanScreen
