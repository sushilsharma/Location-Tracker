import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.locationtrack.app',
  appName: 'LocationTrack',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    // Configure Capacitor plugins
    BackgroundGeolocation: {
      startOnBoot: true,
      notification: {
        title: 'Location Tracking',
        text: 'Tracking your location in the background'
      },
      stationaryRadius: 25,
      distanceFilter: 10,
      debug: false,
      stopOnTerminate: false,
      startForeground: true,
      desiredAccuracy: 'high',
      interval: 5000,
      fastestInterval: 3000
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_location'
    },
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: "#3880FF",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#3880FF",
      overlaysWebView: false
    }
  },
  android: {
    useLegacyBridge: true,
    backgroundColor: "#3880FF",
    // Android specific configuration
    appendUserAgent: "LocationTracker Android App",
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true
  },
  ios: {
    contentInset: "always",
    // iOS specific configuration
    backgroundColor: "#3880FF", 
    scheme: "app",
    limitsNavigationsToAppBoundDomains: true,
    appendUserAgent: "LocationTracker iOS App",
    allowsLinkPreview: false
  }
};

export default config;
