import type { CapacitorConfig } from '@capacitor/cli';

// v4.3 변경 (2026-06-30): CapacitorHttp.enabled true→false
// 원인: CapacitorHttp가 전역 fetch를 가로채면서 QR 스캐너(@yudiel/react-qr-scanner)의
// WASM 디코더 로딩이 깨짐 (Capacitor 공식 이슈 #6123과 동일 증상).
// physical/verify, physical/session/start는 CameraScreen.tsx에서
// CapacitorHttp 플러그인을 명시적으로 직접 호출하도록 전환하여 네이티브 HTTP는 그쪽만 유지.
const config: CapacitorConfig = {
  appId: 'com.artion.legittag',
  appName: 'LegitTag',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['neo-api.artionchain.com']
  },
  android: {
    loggingBehavior: 'debug',
    webContentsDebuggingEnabled: true
  },
  plugins: {
    CapacitorHttp: {
      enabled: false
    },
    Camera: {
      presentationStyle: 'fullscreen'
    }
  }
};
export default config;


