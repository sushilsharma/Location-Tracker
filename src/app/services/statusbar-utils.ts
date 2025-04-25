import { Injectable } from '@angular/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Platform } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class StatusBarUtils {
  constructor(private platform: Platform) {}

  async setupStatusBar() {
    // Wait for the platform to be ready
    await this.platform.ready();
    
    // Only apply to native apps
    if (!this.platform.is('capacitor')) {
      return;
    }
    
    try {
      // Check if we're running on a device with a notch
      const isNotchDevice = this.isNotchDevice();
      
      if (this.platform.is('android')) {
        // Android status bar setup
        await StatusBar.setBackgroundColor({ color: '#3880ff' });
        await StatusBar.setStyle({ style: Style.Dark });
        
        // Don't change the overlay webview setting on Android
        // This ensures proper handling by Ionic
        
        if (this.isAndroid10OrHigher()) {
          // Avoid adding redundant classes
          document.documentElement.style.setProperty('--ion-safe-area-top', '24px');
        }
      } else if (this.platform.is('ios')) {
        // iOS status bar setup
        await StatusBar.setStyle({ style: Style.Dark });
        
        if (isNotchDevice) {
          // For notch devices (iPhone X and newer)
          // Let Ionic handle the safe area automatically
          document.documentElement.classList.add('ios-notch');
          // Don't set overlay to true, as Ionic handles this
          await StatusBar.setOverlaysWebView({ overlay: false });
        } else {
          // For older iOS devices
          await StatusBar.setOverlaysWebView({ overlay: false });
          document.documentElement.classList.add('ios-no-notch');
          // Set a fixed safe area for non-notch devices
          document.documentElement.style.setProperty('--ion-safe-area-top', '20px');
        }
        
        await StatusBar.setBackgroundColor({ color: '#00000000' });
      }
    } catch (err) {
      console.error('Error setting up status bar:', err);
    }
  }
  
  private isNotchDevice(): boolean {
    // Simple detection based on device window
    if (this.platform.is('ios') && window.screen) {
      // iPhone X and newer in portrait mode typically have height greater than 800
      // and width of 375 or 414
      return window.screen.height >= 800 && (window.screen.width === 375 || window.screen.width === 414);
    }
    
    // For Android, we can check for a cutout
    if (this.platform.is('android') && 'AndroidNotch' in window) {
      return true;
    }
    
    return false;
  }
  
  private isAndroid10OrHigher(): boolean {
    // Android 10 is API level 29
    if (this.platform.is('android') && navigator.userAgent) {
      // Look for Android version in user agent
      const match = navigator.userAgent.match(/Android (\d+)/);
      if (match && match[1]) {
        return parseInt(match[1], 10) >= 10;
      }
    }
    return false;
  }
} 