import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { LocationService, LocationData, LocationStats } from '../services/location.service';
import { Subscription, interval } from 'rxjs';
import { Network } from '@capacitor/network';
import { AlertController } from '@ionic/angular';
import * as L from 'leaflet';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit, OnDestroy, AfterViewInit {
  currentLocation: LocationData | null = null;
  locationHistory: LocationData[] = [];
  locationStats: LocationStats = {
    totalDistance: 0,
    totalTime: 0
  };
  
  isTracking = false;
  isBackgroundTracking = false;
  locationServicesDisabled = false;
  locationServicesAlertShown = false;
  
  private settingsSubscription: Subscription | null = null;
  private historySubscription: Subscription | null = null;
  private statsSubscription: Subscription | null = null;
  private locationUpdateSubscription: Subscription | null = null;
  private locationServicesSubscription: Subscription | null = null;
  private map: L.Map | null = null;
  private marker: L.Marker | null = null;
  private accuracyCircle: L.Circle | null = null;

  constructor(
    private locationService: LocationService,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    // Check permissions first, but don't force redirect to settings
    this.checkAndRequestPermissionsGently();
    
    // Subscribe to settings updates
    this.settingsSubscription = this.locationService.getSettings().subscribe(settings => {
      this.isTracking = settings.isTrackingEnabled;
      this.isBackgroundTracking = settings.isBackgroundTrackingEnabled;
    });
    
    // Subscribe to location history
    this.historySubscription = this.locationService.getLocationHistory().subscribe(history => {
      this.locationHistory = history;
      
      // If history exists, set current location to the latest point
      if (history.length > 0) {
        this.currentLocation = history[history.length - 1];
        this.updateMapMarker();
      }
    });
    
    // Subscribe to location stats
    this.statsSubscription = this.locationService.getLocationStats().subscribe(stats => {
      this.locationStats = stats;
    });
    
    // Subscribe to location services status
    this.locationServicesSubscription = this.locationService.getLocationServicesStatus().subscribe(
      async (isEnabled) => {
        // Update UI flag
        this.locationServicesDisabled = !isEnabled;
        
        // Show alert if services just disabled and we haven't shown one yet
        if (!isEnabled && !this.locationServicesAlertShown) {
          this.locationServicesAlertShown = true;
          await this.showLocationServicesAlert();
        } else if (isEnabled) {
          // Reset alert shown flag when services are enabled again
          this.locationServicesAlertShown = false;
        }
      }
    );
    
    // Periodically update current position, but only if permissions granted
    this.locationUpdateSubscription = interval(10000).subscribe(async () => {
      const permissionStatus = await this.locationService.checkLocationPermissions();
      if (permissionStatus && !this.isTracking) {
        // If not actively tracking, still update the current location for display
        try {
          const location = await this.locationService.getCurrentPosition();
          if (location) {
            this.currentLocation = location;
            this.updateMapMarker();
            this.locationServicesDisabled = false;
          }
        } catch(err) {
          console.error('Error updating current position:', err);
          this.locationServicesDisabled = true;
        }
      }
    });
    
    // Monitor network state
    Network.addListener('networkStatusChange', status => {
      if (status.connected) {
        console.log('Network connected, syncing data if needed');
        // Here you could implement syncing data with a server
      }
    });
  }

  ngAfterViewInit() {
    // Initialize map after view is ready
    setTimeout(() => {
      this.initMap();
    }, 500); // increased timeout for DOM to be fully ready
  }

  ngOnDestroy() {
    // Clean up subscriptions
    if (this.settingsSubscription) {
      this.settingsSubscription.unsubscribe();
      this.settingsSubscription = null;
    }
    
    if (this.historySubscription) {
      this.historySubscription.unsubscribe();
      this.historySubscription = null;
    }
    
    if (this.statsSubscription) {
      this.statsSubscription.unsubscribe();
      this.statsSubscription = null;
    }
    
    if (this.locationUpdateSubscription) {
      this.locationUpdateSubscription.unsubscribe();
      this.locationUpdateSubscription = null;
    }
    
    if (this.locationServicesSubscription) {
      this.locationServicesSubscription.unsubscribe();
      this.locationServicesSubscription = null;
    }
    
    // Remove network listeners
    Network.removeAllListeners();
    
    // Clean up map
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  async toggleTracking() {
    if (this.isTracking) {
      await this.locationService.stopTracking();
    } else {
      // Check permissions first
      const hasPermission = await this.locationService.checkLocationPermissions();
      if (!hasPermission) {
        // Only now request permissions explicitly
        const granted = await this.locationService.requestLocationPermissions();
        if (!granted) {
          console.error('Location permissions denied');
          return;
        }
      }
      
      const success = await this.locationService.startTracking();
      if (!success) {
        console.error('Failed to start tracking');
      }
    }
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    let result = '';
    
    if (hours > 0) {
      result += `${hours}h `;
    }
    
    if (minutes > 0 || hours > 0) {
      result += `${minutes}m `;
    }
    
    result += `${remainingSeconds}s`;
    
    return result;
  }

  private initMap() {
    try {
      console.log('Initializing map...');
      
      // Default location (will be updated when we get a real location)
      const defaultLatLng: L.LatLngExpression = [0, 0];
      
      // Check if map element exists
      const mapElement = document.getElementById('current-map');
      if (!mapElement) {
        console.error('Map element not found!');
        return;
      }
      
      console.log('Map element found:', mapElement);
      
      // Create the map with OpenStreetMap tiles
      if (this.map) {
        this.map.remove(); // Remove existing map instance if any
      }
      
      this.map = L.map('current-map', {
        center: defaultLatLng,
        zoom: 3, // Lower zoom level initially
        attributionControl: true
      });
      
      // Add the OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(this.map);
      
      // Create a marker for current location
      const fallbackIcon = L.divIcon({
        className: 'custom-div-icon',
        html: '<div style="background-color:#2979FF;width:16px;height:16px;border-radius:50%;border:2px solid white;"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      
      try {
        this.marker = L.marker(defaultLatLng, { icon: fallbackIcon }).addTo(this.map);
      } catch (e) {
        console.error('Failed to create marker:', e);
      }
      
      // Force a resize to ensure map renders correctly
      setTimeout(() => {
        this.map?.invalidateSize();
      }, 100);
      
      // Get initial position
      this.updateCurrentPosition();
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  }

  private async updateCurrentPosition() {
    try {
      const location = await this.locationService.getCurrentPosition();
      if (location) {
        this.currentLocation = location;
        this.updateMapMarker();
        this.locationServicesDisabled = false;
      } else {
        this.locationServicesDisabled = true;
      }
    } catch (error) {
      console.error('Error getting current position:', error);
      this.locationServicesDisabled = true;
    }
  }

  private updateMapMarker() {
    if (!this.map || !this.marker || !this.currentLocation) {
      return;
    }
    
    const position: L.LatLngExpression = [
      this.currentLocation.latitude,
      this.currentLocation.longitude
    ];
    
    // Update marker position
    this.marker.setLatLng(position);
    
    // Center map on the current position
    this.map.setView(position, 15);
    
    // Create accuracy circle
    if (this.currentLocation.accuracy) {
      // Remove old circle if it exists
      if (this.accuracyCircle) {
        this.map.removeLayer(this.accuracyCircle);
      }
      
      // Create new accuracy circle
      this.accuracyCircle = L.circle(position, {
        radius: this.currentLocation.accuracy,
        color: '#4285F4',
        fillColor: '#4285F4',
        fillOpacity: 0.2,
        weight: 1
      }).addTo(this.map);
    }
  }

  // New method to check permissions without forcing settings
  private async checkAndRequestPermissionsGently() {
    try {
      const hasPermission = await this.locationService.checkLocationPermissions();
      // We won't request permissions automatically on startup
      // This avoids the automatic redirection to settings
      console.log('Location permissions status:', hasPermission ? 'Granted' : 'Not granted');
      
      // Check if location services are enabled by trying to get the current position
      try {
        await this.updateCurrentPosition();
      } catch (error) {
        console.error('Error checking location services:', error);
        this.locationServicesDisabled = true;
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
      this.locationServicesDisabled = true;
    }
  }

  // Show alert when location services are disabled
  private async showLocationServicesAlert() {
    const alert = await this.alertController.create({
      header: 'Location Services Disabled',
      message: 'This app requires location services to function properly. Please enable location services in your device settings.',
      buttons: [
        {
          text: 'OK',
          role: 'cancel'
        }
      ],
      backdropDismiss: false
    });
    
    await alert.present();
    
    // Reset the flag when alert is dismissed
    await alert.onDidDismiss();
    this.locationServicesAlertShown = false;
  }
}
