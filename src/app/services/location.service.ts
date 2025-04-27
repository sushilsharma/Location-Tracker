import { Injectable } from '@angular/core';
import { Geolocation, Position, PositionOptions } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { App } from '@capacitor/app';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { StorageService } from './storage.service';
import { NotificationService } from './notification.service';
import { registerPlugin } from '@capacitor/core';
import { Platform } from '@ionic/angular';

// Register the BackgroundGeolocation plugin
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  'BackgroundGeolocation'
);

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  speed?: number;
  altitude?: number;
  activityType?: string;
  isBackgroundLocation?: boolean;  // Added to track if location was obtained in background
}

export interface LocationSettings {
  isTrackingEnabled: boolean;
  isBackgroundTrackingEnabled: boolean;
  showNotification: boolean;
  trackingInterval: number;
  locationAccuracy: 'high' | 'medium' | 'low';
  radius: number;
  referenceLatitude?: number;
  referenceLongitude?: number;
}

export interface LocationStats {
  totalDistance: number;
  totalTime: number;
  startTime?: number;
  endTime?: number;
}

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  private watchId: string | null = null;
  private backgroundWatchId: string | null = null;
  private defaultSettings: LocationSettings = {
    isTrackingEnabled: false,
    isBackgroundTrackingEnabled: false,
    showNotification: true,
    trackingInterval: 10, // seconds
    locationAccuracy: 'high',
    radius: 10 // meters
  };
  
  private locationHistory: LocationData[] = [];
  private locationHistorySubject = new BehaviorSubject<LocationData[]>([]);
  private settingsSubject = new BehaviorSubject<LocationSettings>(this.defaultSettings);
  private locationStatsSubject = new BehaviorSubject<LocationStats>({
    totalDistance: 0,
    totalTime: 0
  });
  
  private isTracking = false;
  private isBackgroundTracking = false;

  private locationServicesStatus = new BehaviorSubject<boolean>(true);
  private locationMonitorInterval: any = null;

  constructor(
    private storageService: StorageService,
    private notificationService: NotificationService,
    private platform: Platform
  ) {
    this.loadSettings();
    this.loadLocationHistory();
    
    // Monitor app state to handle transitions between foreground and background
    App.addListener('appStateChange', async ({ isActive }) => {
      const settings = this.settingsSubject.getValue();
      
      if (settings.isTrackingEnabled) {
        if (isActive) {
          // App came to foreground
          if (this.isBackgroundTracking) {
            // Start foreground tracking first, then stop background
            const started = await this.startForegroundTracking();
            if (started) {
              await this.stopBackgroundTracking();
            }
          }
          
          // Check location services when app comes to foreground
          this.checkLocationServices();
        } else {
          // App went to background
          if (settings.isBackgroundTrackingEnabled && this.isTracking) {
            // Start background tracking first, then stop foreground
            const started = await this.startBackgroundTracking();
            if (started) {
              await this.stopForegroundTracking();
            }
          }
        }
      }
      
      // Start or stop location services monitoring based on app state
      if (isActive) {
        this.startLocationServicesMonitor();
      } else {
        this.stopLocationServicesMonitor();
      }
    });
    
    // Start location services monitoring when service is created
    this.startLocationServicesMonitor();
  }

  // Public API methods
  
  async requestLocationPermissions(): Promise<boolean> {
    try {
      const permission = await Geolocation.requestPermissions();
      return permission.location === 'granted';
    } catch (error) {
      console.error('Error requesting location permissions:', error);
      return false;
    }
  }

  async checkLocationPermissions(): Promise<boolean> {
    try {
      const permission = await Geolocation.checkPermissions();
      return permission.location === 'granted';
    } catch (error) {
      console.error('Error checking location permissions:', error);
      return false;
    }
  }

  async getCurrentPosition(): Promise<LocationData | null> {
    try {
      const options: PositionOptions = {
        enableHighAccuracy: this.getAccuracyFromSetting()
      };
      
      const position = await Geolocation.getCurrentPosition(options);
      const locationData = this.positionToLocationData(position);
      
      return locationData;
    } catch (error: any) {
      console.error('Error getting current position:', error);
      
      // Determine the specific error type and show appropriate message
      if (error.code === 2) { // POSITION_UNAVAILABLE
        await this.notificationService.showNotification(
          'Location Services Disabled',
          'Please enable location services in your device settings to use this app.'
        );
      } else if (error.code === 1) { // PERMISSION_DENIED
        await this.notificationService.showNotification(
          'Location Permission Denied',
          'This app requires location permission to function properly.'
        );
      } else {
        await this.notificationService.showNotification(
          'Location Error',
          'Unable to get current location. Please check your GPS settings.'
        );
      }
      return null;
    }
  }

  async startTracking(): Promise<boolean> {
    const settings = this.settingsSubject.getValue();
    
    if (!settings.isTrackingEnabled) {
      settings.isTrackingEnabled = true;
      this.settingsSubject.next(settings);
      await this.saveSettings();
      
      const isInForeground = true; // Initially we're in foreground
      
      if (isInForeground) {
        // Show tracking notification
        if (settings.isBackgroundTrackingEnabled) {
          await this.notificationService.showTrackingNotification(true);
        }
        return this.startForegroundTracking();
      } else if (settings.isBackgroundTrackingEnabled) {
        await this.notificationService.showTrackingNotification(true);
        return this.startBackgroundTracking();
      }
    }
    
    return this.isTracking || this.isBackgroundTracking;
  }

  async stopTracking(): Promise<void> {
    const settings = this.settingsSubject.getValue();
    settings.isTrackingEnabled = false;
    this.settingsSubject.next(settings);
    await this.saveSettings();
    
    await this.stopForegroundTracking();
    await this.stopBackgroundTracking();
    
    // Remove tracking notification
    await this.notificationService.showTrackingNotification(false);
  }

  async updateSettings(newSettings: Partial<LocationSettings>): Promise<void> {
    const currentSettings = this.settingsSubject.getValue();
    const updatedSettings = { ...currentSettings, ...newSettings };
    
    const wasTrackingEnabled = currentSettings.isTrackingEnabled;
    const wasBackgroundTrackingEnabled = currentSettings.isBackgroundTrackingEnabled;
    
    this.settingsSubject.next(updatedSettings);
    await this.saveSettings();
    
    // Handle tracking state changes based on settings updates
    if (updatedSettings.isTrackingEnabled !== wasTrackingEnabled) {
      if (updatedSettings.isTrackingEnabled) {
        await this.startTracking();
      } else {
        await this.stopTracking();
      }
    } else if (updatedSettings.isTrackingEnabled &&
               updatedSettings.isBackgroundTrackingEnabled !== wasBackgroundTrackingEnabled) {
      // Update background tracking if that setting changed
      // Nothing to do immediately, this will be handled when app state changes
    }
  }

  async clearLocationHistory(): Promise<void> {
    this.locationHistory = [];
    this.locationHistorySubject.next([]);
    this.locationStatsSubject.next({
      totalDistance: 0,
      totalTime: 0
    });
    await this.storageService.set('locationHistory', JSON.stringify([]));
  }

  getLocationHistory(): Observable<LocationData[]> {
    return this.locationHistorySubject.asObservable();
  }

  getSettings(): Observable<LocationSettings> {
    return this.settingsSubject.asObservable();
  }

  getLocationStats(): Observable<LocationStats> {
    return this.locationStatsSubject.asObservable();
  }

  // New method to get location services status observable
  getLocationServicesStatus(): Observable<boolean> {
    return this.locationServicesStatus.asObservable();
  }

  // Private implementation methods
  
  private async startForegroundTracking(): Promise<boolean> {
    if (this.isTracking) return true;
    
    try {
      const hasPermission = await this.checkLocationPermissions();
      if (!hasPermission) {
        const granted = await this.requestLocationPermissions();
        if (!granted) {
          await this.notificationService.showNotification(
            'Permission Required', 
            'Location permission is required for tracking'
          );
          return false;
        }
      }

      const settings = this.settingsSubject.getValue();
      const options: PositionOptions = {
        enableHighAccuracy: this.getAccuracyFromSetting(),
        timeout: 10000,
      };
      
      // Start tracking
      this.watchId = await Geolocation.watchPosition(options, (position, err) => {
        if (err) {
          console.error('Geolocation watch error:', err);
          this.handleLocationError(err);
          return;
        }
        
        if (position) {
          this.handleNewPosition(position);
        }
      });
      
      this.isTracking = true;
      
      // Update stats
      const stats = this.locationStatsSubject.getValue();
      if (!stats.startTime) {
        stats.startTime = Date.now();
        this.locationStatsSubject.next(stats);
      }
      
      return true;
    } catch (error) {
      console.error('Error starting foreground location tracking:', error);
      await this.notificationService.showNotification(
        'Tracking Error', 
        'Failed to start location tracking'
      );
      return false;
    }
  }

  private async stopForegroundTracking(): Promise<void> {
    if (this.watchId) {
      await Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
      this.isTracking = false;
      
      // Update stats
      const stats = this.locationStatsSubject.getValue();
      stats.endTime = Date.now();
      if (stats.startTime) {
        stats.totalTime += (stats.endTime - stats.startTime) / 1000; // in seconds
      }
      this.locationStatsSubject.next(stats);
    }
  }

  private async startBackgroundTracking(): Promise<boolean> {
    if (this.isBackgroundTracking) return true;
    
    try {
      const settings = this.settingsSubject.getValue();
      
      const watcher = await BackgroundGeolocation.addWatcher({
          // Enhanced background settings
          backgroundMessage: "Location tracking is active",
          backgroundTitle: "Location Tracking Active",
          requestPermissions: true,
          stale: false,
          // The distance filter determines the minimum distance in meters that the device needs to move before an update event is triggered
          distanceFilter: Math.max(settings.radius, 10)
      },
      (location, error) => {
          if (error) {
              console.error('Background location error:', error);
              if (error.code === 'NOT_AUTHORIZED') {
                  this.notificationService.showNotification(
                      'Permission Error',
                      'Location permission denied. Please enable in settings.'
                  );
              }
              return;
          }
          
          if (location) {
              const locationData: LocationData = {
                  latitude: location.latitude,
                  longitude: location.longitude,
                  accuracy: location.accuracy || 0,
                  timestamp: location.time || Date.now(),
                  speed: location.speed || 0,
                  altitude: location.altitude || undefined,
                  isBackgroundLocation: true // Mark as background location
              };
              
              this.addLocationToHistory(locationData);
          }
      });

      this.backgroundWatchId = typeof watcher === 'string' ? watcher : '';
      this.isBackgroundTracking = true;
      
      // Show persistent notification when background tracking starts
      await this.notificationService.showTrackingNotification(true);
      
      // Update stats
      const stats = this.locationStatsSubject.getValue();
      if (!stats.startTime) {
        stats.startTime = Date.now();
        this.locationStatsSubject.next(stats);
      }
      
      return true;
    } catch (error) {
      console.error('Error starting background location tracking:', error);
      await this.notificationService.showNotification(
        'Tracking Error', 
        'Failed to start background location tracking'
      );
      return false;
    }
  }

  private async stopBackgroundTracking(): Promise<void> {
    try {
      await BackgroundGeolocation.removeWatcher({
        id: this.backgroundWatchId || ''
      });
      this.backgroundWatchId = null;
      this.isBackgroundTracking = false;
      
      // Update stats
      const stats = this.locationStatsSubject.getValue();
      stats.endTime = Date.now();
      if (stats.startTime) {
        stats.totalTime += (stats.endTime - stats.startTime) / 1000; // in seconds
      }
      this.locationStatsSubject.next(stats);
    } catch (error) {
      console.error('Error stopping background tracking:', error);
    }
  }

  private handleNewPosition(position: Position): void {
    const locationData = this.positionToLocationData(position);
    this.addLocationToHistory(locationData);
  }

  private positionToLocationData(position: Position): LocationData {
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
      speed: position.coords.speed || 0,
      altitude: position.coords.altitude || undefined,
      isBackgroundLocation: !this.isTracking // If not in foreground tracking mode, it's a background location
    };
  }

  private async addLocationToHistory(location: LocationData): Promise<void> {
    const settings = this.settingsSubject.getValue();
    
    // Don't add points if there's no previous history
    if (this.locationHistory.length === 0) {
      // For the first point, always add it
      this.locationHistory.push(location);
      this.locationHistorySubject.next([...this.locationHistory]);
      
      // Initialize stats with startTime
      const stats = this.locationStatsSubject.getValue();
      stats.startTime = location.timestamp;
      stats.endTime = location.timestamp;
      this.locationStatsSubject.next({...stats});
      
      // Save to storage
      await this.saveLocationHistory();
      return;
    }
    
    // Get the last location
    const lastLocation = this.locationHistory[this.locationHistory.length - 1];
    
    // Calculate the distance from last point
    const distance = this.calculateDistance(
      lastLocation.latitude, lastLocation.longitude,
      location.latitude, location.longitude
    );
    
    // Only add point if:
    // 1. Distance is greater than the minimum radius threshold (to filter GPS jitter)
    // 2. Distance is greater than the combined accuracy of both points (to ensure meaningful movement)
    // 3. Or if it's been more than 30 seconds since the last point (periodic updates)
    const timeThreshold = 30 * 1000; // 30 seconds in milliseconds
    const accuracyThreshold = Math.max(lastLocation.accuracy, 5) + Math.max(location.accuracy, 5);
    const timeDifference = location.timestamp - lastLocation.timestamp;
    
    if (distance >= settings.radius && 
        distance > accuracyThreshold &&
        (distance > 10 || timeDifference > timeThreshold)) {
      // Add the new location
      this.locationHistory.push(location);
      this.locationHistorySubject.next([...this.locationHistory]);
      
      // Update stats
      const stats = this.locationStatsSubject.getValue();
      stats.totalDistance += distance;
      stats.endTime = location.timestamp;
      stats.totalTime = (stats.endTime - (stats.startTime || 0)) / 1000; // in seconds
      this.locationStatsSubject.next({...stats});
      
      console.log(`Added point - Distance: ${distance.toFixed(2)}m, Accuracy: ${location.accuracy}m`);
      
      // Save to storage
      await this.saveLocationHistory();
    } else {
      console.log(`Skipped point - Distance: ${distance.toFixed(2)}m, Accuracy: ${location.accuracy}m, TimeDiff: ${timeDifference/1000}s`);
    }
  }

  private handleLocationError(error: any): void {
    console.error('Location error:', error);
    
    // Check for specific errors
    if (error.code === 1) { // PERMISSION_DENIED
      this.notificationService.showNotification(
        'Permission Error',
        'Location permission denied. Please enable in settings.'
      );
    } else if (error.code === 2) { // POSITION_UNAVAILABLE
      this.notificationService.showNotification(
        'Location Services Disabled',
        'Please enable location services in your device settings to use this app.'
      );
    } else if (error.code === 3) { // TIMEOUT
      this.notificationService.showNotification(
        'Timeout Error',
        'Location request timed out. Please try again later.'
      );
    }
  }

  // Utility methods
  
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = this.toRadians(lat1);
    const φ2 = this.toRadians(lat2);
    const Δφ = this.toRadians(lat2 - lat1);
    const Δλ = this.toRadians(lon2 - lon1);

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // in meters
  }

  private toRadians(degrees: number): number {
    return degrees * Math.PI / 180;
  }

  private getAccuracyFromSetting(): boolean {
    const settings = this.settingsSubject.getValue();
    switch (settings.locationAccuracy) {
      case 'high':
        return true;
      case 'medium':
      case 'low':
        return false;
      default:
        return true;
    }
  }

  // Storage methods
  
  private async loadSettings(): Promise<void> {
    try {
      const settingsJson = await this.storageService.get('locationSettings');
      
      if (settingsJson) {
        const settings = JSON.parse(settingsJson);
        this.settingsSubject.next({...this.defaultSettings, ...settings});
      }
    } catch (error) {
      console.error('Error loading location settings:', error);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      const settings = this.settingsSubject.getValue();
      await this.storageService.set('locationSettings', JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving location settings:', error);
    }
  }

  private async loadLocationHistory(): Promise<void> {
    try {
      const historyJson = await this.storageService.get('locationHistory');
      
      if (historyJson) {
        this.locationHistory = JSON.parse(historyJson);
        this.locationHistorySubject.next([...this.locationHistory]);
        
        // Recalculate stats
        this.recalculateStats();
      }
    } catch (error) {
      console.error('Error loading location history:', error);
    }
  }

  private async saveLocationHistory(): Promise<void> {
    try {
      await this.storageService.set('locationHistory', JSON.stringify(this.locationHistory));
    } catch (error) {
      console.error('Error saving location history:', error);
    }
  }

  private recalculateStats(): void {
    const stats: LocationStats = {
      totalDistance: 0,
      totalTime: 0
    };
    
    if (this.locationHistory.length >= 2) {
      // Calculate total distance
      for (let i = 1; i < this.locationHistory.length; i++) {
        const prev = this.locationHistory[i - 1];
        const curr = this.locationHistory[i];
        
        stats.totalDistance += this.calculateDistance(
          prev.latitude, prev.longitude,
          curr.latitude, curr.longitude
        );
      }
      
      // Calculate total time
      const first = this.locationHistory[0];
      const last = this.locationHistory[this.locationHistory.length - 1];
      stats.totalTime = (last.timestamp - first.timestamp) / 1000; // in seconds
      stats.startTime = first.timestamp;
      stats.endTime = last.timestamp;
    }
    
    this.locationStatsSubject.next(stats);
  }

  // Check if location services are enabled
  async checkLocationServices(): Promise<boolean> {
    try {
      // Try to get current position with a short timeout
      const position = await Geolocation.getCurrentPosition({
        timeout: 3000,
        enableHighAccuracy: false
      });
      
      // If we get a position, location services are on
      this.locationServicesStatus.next(true);
      return true;
    } catch (error: any) {
      console.log('Location services check error:', error);
      
      // If error code is 2, location services are disabled
      if (error.code === 2) {
        this.locationServicesStatus.next(false);
        return false;
      }
      
      // For permission errors (code 1), we return true for location services
      // since the service itself is on, just permissions denied
      return true;
    }
  }
  
  // Start monitoring location services
  private startLocationServicesMonitor() {
    if (this.locationMonitorInterval) {
      return; // Already monitoring
    }
    
    // Check immediately
    this.checkLocationServices();
    
    // Then check every 5 seconds
    this.locationMonitorInterval = setInterval(async () => {
      const wasEnabled = this.locationServicesStatus.getValue();
      const isEnabled = await this.checkLocationServices();
      
      // If location service was turned off, show notification
      if (wasEnabled && !isEnabled) {
        await this.notificationService.showNotification(
          'Location Services Disabled',
          'Please enable location services in your device settings to use this app properly.'
        );
      }
    }, 5000);
  }
  
  // Stop monitoring location services
  private stopLocationServicesMonitor() {
    if (this.locationMonitorInterval) {
      clearInterval(this.locationMonitorInterval);
      this.locationMonitorInterval = null;
    }
  }
  
  // Clean up on service destruction
  ngOnDestroy() {
    this.stopLocationServicesMonitor();
    App.removeAllListeners();
  }
}
