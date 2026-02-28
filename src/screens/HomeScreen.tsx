import type { HomeScreenProps } from '../types/app.types'

const HomeScreen = ({ safeGoCamera, safeGoScan, openGalleryPicker, t }: HomeScreenProps) => (
  <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 32px', backgroundColor: '#0a0a0c' }}>
    <div style={{ paddingTop: '120px', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2.25rem', fontWeight: '200', letterSpacing: '0.25em', marginBottom: '8px', color: 'rgba(255,255,255,0.9)' }}>Geo Cam</h1>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', letterSpacing: '0.2em' }}>{t('home.subtitle')}</p>
    </div>
    <div style={{ marginTop: '100px', width: '260px', position: 'relative', zIndex: 10 }}>
      <button onClick={safeGoCamera} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', fontWeight: '300', letterSpacing: '0.1em', cursor: 'pointer' }}>Camera</button>
      <div style={{ height: '50px' }} />
      <button onClick={safeGoScan} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', fontWeight: '300', letterSpacing: '0.1em', cursor: 'pointer' }}>Scan</button>
      <div style={{ height: '30px' }} />
      <button onClick={openGalleryPicker} style={{ position: 'relative', zIndex: 9999, width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', fontWeight: '300', letterSpacing: '0.1em', fontSize: '15px', cursor: 'pointer' }}>Gallery</button>
    </div>
    <div style={{ position: 'absolute', bottom: 'max(40px, env(safe-area-inset-bottom))', textAlign: 'center', left: 0, right: 0, zIndex: 1, pointerEvents: 'none' }}>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', letterSpacing: '0.2em', pointerEvents: 'none' }}>Powered by Artion</p>
    </div>
  </div>
)

export default HomeScreen
