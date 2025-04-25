import { Component, OnInit, OnDestroy } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { LocationService, LocationSettings, LocationData } from '../services/location.service';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: false
})
export class SettingsPage implements OnInit, OnDestroy {
  settings: LocationSettings = {
    isTrackingEnabled: false,
    isBackgroundTrackingEnabled: false,
    showNotification: true,
    trackingInterval: 10,
    locationAccuracy: 'high',
    radius: 10
  };
  
  referenceLocation: LocationData | null = null;
  
  private settingsSubscription: Subscription | null = null;

  constructor(
    private locationService: LocationService,
    private alertController: AlertController,
    private toastController: ToastController,
    private router: Router,
    public platform: Platform,
    private appComponent: AppComponent
  ) {}

  ngOnInit() {
    // Subscribe to settings changes
    this.settingsSubscription = this.locationService.getSettings().subscribe(settings => {
      this.settings = { ...settings };
      
      // Check for reference location
      if (settings.referenceLatitude && settings.referenceLongitude) {
        this.referenceLocation = {
          latitude: settings.referenceLatitude,
          longitude: settings.referenceLongitude,
          accuracy: 0,
          timestamp: Date.now()
        };
      } else {
        this.referenceLocation = null;
      }
    });
  }

  ngOnDestroy() {
    if (this.settingsSubscription) {
      this.settingsSubscription.unsubscribe();
      this.settingsSubscription = null;
    }
  }

  async onSettingsChange() {
    await this.locationService.updateSettings(this.settings);
    
    if (this.settings.isTrackingEnabled) {
      if (!await this.locationService.checkLocationPermissions()) {
        await this.requestPermissions();
      }
    }

    this.showToast('Settings updated');
  }

  async requestPermissions() {
    const granted = await this.locationService.requestLocationPermissions();
    
    if (granted) {
      this.showToast('Location permissions granted');
    } else {
      this.showToast('Location permissions denied', 'danger');
    }
  }

  async storeCurrentLocation() {
    const location = await this.locationService.getCurrentPosition();
    
    if (location) {
      this.referenceLocation = location;
      
      // Update settings with reference location
      await this.locationService.updateSettings({
        referenceLatitude: location.latitude,
        referenceLongitude: location.longitude
      });
      
      this.showToast('Current location stored');
    } else {
      this.showToast('Failed to get current location', 'danger');
    }
  }

  async clearReferenceLocation() {
    this.referenceLocation = null;
    
    // Update settings to remove reference location
    await this.locationService.updateSettings({
      referenceLatitude: undefined,
      referenceLongitude: undefined
    });
    
    this.showToast('Reference location cleared');
  }

  async confirmClearHistory() {
    const alert = await this.alertController.create({
      header: 'Clear Location History',
      message: 'Are you sure you want to clear all your location history data? This action cannot be undone.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Clear',
          role: 'destructive',
          handler: () => {
            this.clearLocationHistory();
          }
        }
      ]
    });
    
    await alert.present();
  }

  private async clearLocationHistory() {
    await this.locationService.clearLocationHistory();
    this.showToast('Location history cleared');
  }

  private async showToast(message: string, color: string = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'bottom'
    });
    
    await toast.present();
  }

  // New method to handle battery optimization
  async requestBatteryOptimization() {
    if (this.platform.is('android')) {
      try {
        await this.appComponent.requestBatteryOptimizationExemption();
      } catch (error) {
        console.error('Failed to open battery settings:', error);
        this.showAlert('Error', 'Unable to open battery optimization settings. Please do this manually in your device settings.');
      }
    } else {
      this.showAlert('Information', 'Battery optimization settings are only available on Android devices.');
    }
  }

  // Add the missing showAlert method
  private async showAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK']
    });
    
    await alert.present();
  }
}
