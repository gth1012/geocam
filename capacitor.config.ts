import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.arteon.geocam',
  appName: 'GeoCam',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  android: {
    loggingBehavior: 'debug',
    webContentsDebuggingEnabled: true
  }
};

export default config;