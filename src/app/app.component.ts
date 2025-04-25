import { Component } from '@angular/core';
import { MenuController, Platform } from '@ionic/angular';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { StatusBar, Style } from '@capacitor/status-bar';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBarUtils } from './services/statusbar-utils';
import { Capacitor, registerPlugin } from '@capacitor/core';

// Import BackgroundGeolocation properly
import { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  constructor(
    private menuCtrl: MenuController,
    private router: Router,
    private platform: Platform,
    private statusBarUtils: StatusBarUtils
  ) {
    this.initializeApp();
    
    // Close menu on navigation
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.menuCtrl.close();
    });
  }

  async initializeApp() {
    await this.platform.ready();
    
    try {
      if (this.platform.is('capacitor')) {
        // Use the StatusBarUtils service to handle status bar correctly on all devices
        await this.statusBarUtils.setupStatusBar();
        
        // Add a CSS class to the body based on the platform
        document.body.classList.add(this.platform.is('ios') ? 'ios' : 'md');
        
        // For Android, DO NOT automatically call battery optimization
        // This was causing redirect to settings - comment it out
        // if (this.platform.is('android')) {
        //   this.requestBatteryOptimizationExemption();
        // }
        
        // Hide the splash screen with a fade
        await SplashScreen.hide({
          fadeOutDuration: 300
        });
        
        // Add event listener for when app goes to background/foreground
        App.addListener('appStateChange', async ({ isActive }) => {
          if (isActive) {
            // App came to foreground, reset status bar
            await this.statusBarUtils.setupStatusBar();
          }
        });
      }
    } catch (err) {
      console.error('Error initializing app:', err);
    }
  }

  closeMenu() {
    this.menuCtrl.close();
  }

  // Modify this method to be called manually from settings page
  async requestBatteryOptimizationExemption() {
    try {
      // Check if we're on a real Android device
      if (Capacitor.isNativePlatform() && this.platform.is('android')) {
        // Try to open battery optimization settings
        console.log('Manually opening battery optimization settings');
        await BackgroundGeolocation.openSettings();
      }
    } catch (error) {
      console.error('Error requesting battery optimization exemption:', error);
    }
  }
}
