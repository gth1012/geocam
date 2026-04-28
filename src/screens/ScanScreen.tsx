import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Scanner } from '@yudiel/react-qr-scanner'
import { API_BASE_URL } from '../api/client'
import type { ScanScreenProps } from '../types/app.types'

const ScanScreen = ({
  safeGoHome,
  BackArrow,
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
  scanContext,
}: ScanScreenProps) => {
  const { t } = useTranslation()
  const [localProcessing, setLocalProcessing] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)
  const scanLockRef = useRef(false)

  // verify 컨텍스트: dina_id만 확보 후 카메라로 이동 (claim 발생 금지)
  const handleVerifyContext = async (dinaCode: string) => {
    setProcessing(true)
    setNetworkError(false)
    setErrorCode(null)

    try {
      const response = await fetch(`${API_BASE_URL}/geocam/status/${dinaCode}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        if (response.status === 404) {
          setScanResultInfo({ status: 'ERROR', message: t('error.dinaNotFound') })
          setScreen('scanResult')
        } else {
          setNetworkError(true)
          setScanResultInfo({ status: 'ERROR', message: t('error.server') })
          setScreen('scanResult')
        }
        setProcessing(false)
        return
      }

      const result = await response.json()
      const resolvedDinaId = result.dina_id || dinaCode
      setDinaId(resolvedDinaId)
      setProcessing(false)
      setScanning(false)
      // verify 컨텍스트: claim 없이 카메라로 이동
      setTimeout(() => { setScreen('camera') }, 300)

    } catch (err) {
      console.error('verify context status check error:', err)
      setNetworkError(true)
      setScanResultInfo({ status: 'ERROR', message: t('error.network') })
      setProcessing(false)
      setScreen('scanResult')
    }
  }

  // claim 컨텍스트: 기존 흐름 (소유권 이벤트, scanResult로 이동)
  const handleClaimContext = async (dinaCode: string) => {
    setProcessing(true)
    setNetworkError(false)
    setErrorCode(null)
    setDinaId(dinaCode)

    try {
      const response = await fetch(`${API_BASE_URL}/geocam/status/${dinaCode}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        if (response.status === 404) {
          setScanResultInfo({ status: 'ERROR', message: t('error.dinaNotFound') })
        } else if (response.status >= 500) {
          setNetworkError(true)
          setScanResultInfo({ status: 'ERROR', message: t('error.server') })
        } else if (response.status === 429) {
          setErrorCode('RATE_LIMIT_EXCEEDED')
          setScanResultInfo({ status: 'ERROR', message: t('error.rateLimit') })
        } else {
          setScanResultInfo({ status: 'ERROR', message: t('error.network') })
        }
        setProcessing(false)
        setScreen('scanResult')
        return
      }

      const result = await response.json()

      if (result.status === 'UNCLAIMED') {
        setScanResultInfo({ status: 'UNCLAIMED', message: result.series_id || undefined })
      } else if (result.status === 'CLAIMED') {
        setScanResultInfo({ status: 'CLAIMED', message: undefined })
      } else {
        setScanResultInfo({ status: 'ERROR', message: t('error.dinaNotFound') })
      }

      setDinaId(result.dina_id || dinaCode)
      setProcessing(false)
      setScanning(false)
      setTimeout(() => { setScreen('scanResult') }, 300)

    } catch (err) {
      console.error('status check error:', err)
      setNetworkError(true)
      setScanResultInfo({ status: 'ERROR', message: t('error.network') })
      setProcessing(false)
      setScreen('scanResult')
    }
  }

  const handleQrDetected = useCallback(async (result: any) => {
    if (scanLockRef.current || localProcessing) return

    if (result && result[0]?.rawValue) {
      const data = result[0].rawValue
      if (data.includes('DINA-') || /^[A-Z0-9]{8,16}$/.test(data.trim())) {
        scanLockRef.current = true
        setLocalProcessing(true)
        setQrData(data)
        setQrDetected(true)

        const dinaMatch = data.match(/DINA-([A-Z0-9]{8,16})/)
        const dinaCode = dinaMatch ? dinaMatch[1] : (/^[A-Z0-9]{8,16}$/.test(data.trim()) ? data.trim() : null)

        if (dinaCode) {
          // 컨텍스트에 따라 분기
          if (scanContext === 'verify') {
            await handleVerifyContext(dinaCode)
          } else {
            await handleClaimContext(dinaCode)
          }
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
  }, [localProcessing, scanContext, t, setQrData, setQrDetected])

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={safeGoHome} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <BackArrow />
        </button>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', letterSpacing: '0.1em' }}>
          {scanContext === 'verify' ? '물리 검증' : t('scan.title')}
        </span>
        <div style={{ width: '40px' }} />
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <div id="scan-scanner" style={{ position: 'absolute', inset: 0 }}>
          {scanning && (
            <Scanner
              onScan={handleQrDetected}
              constraints={{ facingMode: 'environment' }}
              styles={{ container: { width: '100%', height: '100%' }, video: { width: '100%', height: '100%', objectFit: 'cover' } }}
              onError={(err) => { console.error('Scanner error:', err); setCameraError(t('camera.error')) }}
            />
          )}
        </div>

        {cameraError && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: '#0a0a0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <p style={{ color: '#f87171', fontSize: '16px', marginBottom: '12px' }}>{t('camera.error')}</p>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', textAlign: 'center', marginBottom: '24px' }}>{cameraError}</p>
            <button onClick={safeGoHome} style={{ padding: '12px 24px', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer' }}>{t('common.home')}</button>
          </div>
        )}

        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '240px', height: '240px', zIndex: 10, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '50px', height: '50px', borderTop: '4px solid #60a5fa', borderLeft: '4px solid #60a5fa', borderTopLeftRadius: '16px' }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: '50px', height: '50px', borderTop: '4px solid #60a5fa', borderRight: '4px solid #60a5fa', borderTopRightRadius: '16px' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '50px', height: '50px', borderBottom: '4px solid #60a5fa', borderLeft: '4px solid #60a5fa', borderBottomLeftRadius: '16px' }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: '50px', height: '50px', borderBottom: '4px solid #60a5fa', borderRight: '4px solid #60a5fa', borderBottomRightRadius: '16px' }} />
        </div>

        {scanContext === 'verify' && (
          <div style={{ position: 'absolute', top: 'max(90px, calc(env(safe-area-inset-top) + 74px))', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 15, pointerEvents: 'none' }}>
            <div style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: '20px', padding: '5px 16px' }}>
              <p style={{ color: '#60a5fa', fontSize: '12px', fontWeight: '300', letterSpacing: '0.04em', textAlign: 'center' }}>
                포카 QR을 스캔하면 물리 검증이 시작됩니다
              </p>
            </div>
          </div>
        )}

        {scanError && (
          <div style={{ position: 'absolute', top: '25%', left: '50%', transform: 'translateX(-50%)', padding: '12px 24px', background: 'rgba(248,113,113,0.9)', borderRadius: '12px', zIndex: 30 }}>
            <p style={{ color: 'white', fontSize: '14px', margin: 0 }}>{scanError}</p>
          </div>
        )}

        {localProcessing && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '16px 32px', background: 'rgba(0,0,0,0.8)', borderRadius: '12px', zIndex: 20 }}>
            <p style={{ color: '#60a5fa', fontSize: '16px', margin: 0 }}>{t('scan.processing')}...</p>
          </div>
        )}
      </div>

      <div style={{ padding: '24px', paddingBottom: 'max(60px, env(safe-area-inset-bottom))', textAlign: 'center', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', position: 'relative', zIndex: 10 }}>
        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>
          {scanContext === 'verify' ? 'QR 스캔 → 물리 검증' : t('scan.title')}
        </p>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0 }}>{t('scan.guide')}</p>
      </div>

      <style>{`
        #scan-scanner video { width: 100% !important; height: 100% !important; object-fit: cover !important; }
      `}</style>
    </div>
  )
}

export default ScanScreen
