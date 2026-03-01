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
    }
  }
};

export default config;