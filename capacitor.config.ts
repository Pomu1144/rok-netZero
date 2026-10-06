import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pomu.realmofkings',
  appName: 'Realm of Kings',
  webDir: 'dist',
  backgroundColor: '#0b0b0c',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0b0b0c',
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: '#0b0b0c',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: true,
      backgroundColor: '#0b0b0c',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
    LocalNotifications: {
      iconColor: '#b8322a',
    },
  },
};

export default config;
