import type { OtpInputScreenProps } from '../types/app.types'

const OtpInputScreen = ({
  safeGoScan,
  BackArrow,
  t,
  qrData,
  otpInput,
  setOtpInput,
  setQrData,
  setScanMode,
  setQrDetected,
  setCapturedImage,
  setRecordInfo,
  setError,
  setErrorCode,
  setProcessing,
  setNetworkError,
  setVerifyStatus,
  setCameraError,
  setScreen,
}: OtpInputScreenProps) => {
  const handleOtpSubmit = () => {
    if (otpInput.length === 8) {
      const updatedQr = (qrData || '') + ' OTP-' + otpInput.toUpperCase();
      setQrData(updatedQr);
      setScanMode('camera');
      setQrDetected(true);
      setCapturedImage(null);
      setRecordInfo(null);
      setError(null);
      setErrorCode(null);
      setProcessing(false);
      setNetworkError(false);
      setVerifyStatus(null);
      setCameraError(null);
      setScreen('camera');
    }
  };

  const dinaMatch = qrData?.match(/DINA-[A-Z0-9]{13}/);
  const dinaDisplay = dinaMatch ? dinaMatch[0] : qrData || '';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c', padding: '20px', paddingTop: 'max(48px, env(safe-area-inset-top))' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '40px' }}>
        <button onClick={safeGoScan} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><BackArrow /></button>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: '300', marginLeft: '16px', letterSpacing: '0.1em' }}>{t('otp.title')}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '40px' }}>
        <div style={{ marginBottom: '32px', padding: '12px 20px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '4px' }}>DINA 코드</p>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '16px', fontFamily: 'monospace', letterSpacing: '0.1em', margin: 0 }}>{dinaDisplay}</p>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', textAlign: 'center', marginBottom: '24px', maxWidth: '280px', lineHeight: '1.5' }}>{t('otp.subtitle')}</p>
        <input
          type="text"
          value={otpInput}
          onChange={(e) => setOtpInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
          maxLength={8}
          placeholder="OTP"
          style={{
            width: '240px', padding: '16px', fontSize: '20px', fontFamily: 'monospace', letterSpacing: '0.3em', textAlign: 'center',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px',
            color: 'rgba(255,255,255,0.9)', outline: 'none', textTransform: 'uppercase',
          }}
        />
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginTop: '8px' }}>{otpInput.length}/8</p>
        <button
          onClick={handleOtpSubmit}
          disabled={otpInput.length !== 8}
          style={{
            marginTop: '24px', width: '240px', padding: '14px', borderRadius: '12px', fontSize: '15px', fontWeight: '500',
            background: otpInput.length === 8 ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${otpInput.length === 8 ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.06)'}`,
            color: otpInput.length === 8 ? '#4ade80' : 'rgba(255,255,255,0.3)',
            cursor: otpInput.length === 8 ? 'pointer' : 'not-allowed',
          }}
        >{t('otp.confirm')}</button>
      </div>
      <div style={{ paddingBottom: 'max(40px, env(safe-area-inset-bottom))' }} />
    </div>
  );
};

export default OtpInputScreen
