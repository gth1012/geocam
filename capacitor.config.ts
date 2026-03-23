import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.arteon.geocam',
  appName: 'GeoCam',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['neo-studio-api-production.up.railway.app']
  },
  android: {
    loggingBehavior: 'debug',
    webContentsDebuggingEnabled: true
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    Camera: {
      presentationStyle: 'fullscreen'
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '443118969490-cfo1b6peii07cm7a9js3vauer5p59667.apps.googleusercontent.com',
      forceCodeForRefreshToken: true
    }
  }
};
export default config;
