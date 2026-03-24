import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PreviewScreenProps, Screen } from '../types/app.types'

const PreviewScreen = ({
  runPipeline,
  BackArrow,
  previewImage,
  setCapturedImage,
  setScreen,
}: PreviewScreenProps) => {
  const { t } = useTranslation()
  const [verifying, setVerifying] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const handleVerify = async () => {
    setVerifying(true)
    setAnalysisError(null)
    if (previewImage) {
      try {
        setCapturedImage(previewImage)
        await runPipeline(null, previewImage)
      } catch (e) {
        setAnalysisError(t('error.network'))
        setVerifying(false)
      }
    }
  }

  const handleBack = () => {
    if (verifying) { setShowCancelConfirm(true) }
    else { setScreen('gallery' as Screen) }
  }

  const confirmCancel = () => {
    setShowCancelConfirm(false)
    setVerifying(false)
    setScreen('gallery' as Screen)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0c', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px', paddingTop: 'max(48px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={handleBack} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <BackArrow />
        </button>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', letterSpacing: '0.1em' }}>{t('capture.gallery')}</span>
        <div style={{ width: '40px' }} />
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <img src={previewImage} alt="" style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: '12px' }} />
      </div>
      <div style={{ padding: '20px', paddingBottom: 'max(60px, env(safe-area-inset-bottom))' }}>
        {analysisError && <p style={{ color: '#f87171', fontSize: '14px', marginBottom: '8px', textAlign: 'center' }}>{analysisError}</p>}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setScreen('gallery' as Screen)} style={{ flex: 1, padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: '14px', cursor: 'pointer' }}>
            {t('capture.retry')}
          </button>
          <button onClick={handleVerify} disabled={verifying} style={{ flex: 1, padding: '16px', borderRadius: '12px', background: verifying ? 'rgba(74,222,128,0.3)' : 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: '16px', fontWeight: '500', cursor: verifying ? 'default' : 'pointer' }}>
            {verifying ? t('verify.title') + '...' : t('common.confirm')}
          </button>
        </div>
      </div>
      {showCancelConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#1a1a1c', borderRadius: '16px', padding: '24px', maxWidth: '300px', textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '16px', marginBottom: '20px' }}>{t('verify.cancel')}?</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowCancelConfirm(false)} style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', cursor: 'pointer' }}>
                {t('common.confirm')}
              </button>
              <button onClick={confirmCancel} style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', cursor: 'pointer' }}>
                {t('verify.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PreviewScreen