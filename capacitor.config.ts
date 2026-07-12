import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.inpx.bookreader',
  appName: 'INPX Reader',
  webDir: 'dist',
  server: {
    // Разрешить http://192.168.x.x:3000 (локальный INPX без HTTPS)
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    // Нативный HTTP — обходит CORS WebView при запросах к INPX-серверу
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      // 0 = не использовать Capacitor overlay; нативный splash в MainActivity
      launchShowDuration: 0,
      launchAutoHide: true,
      androidSplashResourceName: 'splash_logo',
      androidScaleType: 'CENTER_INSIDE',
      backgroundColor: '#1e1a16',
      showSpinner: false,
    },
  },
};

export default config;
