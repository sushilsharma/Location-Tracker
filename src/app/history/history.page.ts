import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { LocationService, LocationData, LocationStats } from '../services/location.service';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  standalone: false
})
export class HistoryPage implements OnInit, OnDestroy, AfterViewInit {
  locationHistory: LocationData[] = [];
  locationStats: LocationStats = {
    totalDistance: 0,
    totalTime: 0
  };
  
  private historySubscription: Subscription | null = null;
  private statsSubscription: Subscription | null = null;
  private map: L.Map | null = null;
  private mapInitialized = false;

  constructor(private locationService: LocationService) { }

  ngOnInit() {
    // Subscribe to location history
    this.historySubscription = this.locationService.getLocationHistory().subscribe(
      history => {
        this.locationHistory = history;
        if (this.mapInitialized && history.length > 0) {
          this.updateMap();
        }
      }
    );
    
    // Subscribe to location stats
    this.statsSubscription = this.locationService.getLocationStats().subscribe(
      stats => {
        this.locationStats = stats;
      }
    );
  }

  ngAfterViewInit() {
    // Initialize map after view is initialized
    setTimeout(() => {
      this.initMap();
    }, 500); // increased timeout for DOM to be fully ready
  }

  ngOnDestroy() {
    if (this.historySubscription) {
      this.historySubscription.unsubscribe();
      this.historySubscription = null;
    }
    
    if (this.statsSubscription) {
      this.statsSubscription.unsubscribe();
      this.statsSubscription = null;
    }
    
    // Clean up map
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleString();
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
      console.log('Initializing history map...');
      
      // Check if map element exists
      const mapElement = document.getElementById('map');
      if (!mapElement) {
        console.error('History map element not found!');
        return;
      }
      
      console.log('History map element found:', mapElement);
      
      // Create the map with OpenStreetMap tiles
      if (this.map) {
        this.map.remove(); // Remove existing map instance if any
      }
      
      // Create the map with OpenStreetMap tiles
      this.map = L.map('map', {
        center: [0, 0],
        zoom: 3, // Lower zoom level initially
        attributionControl: true
      });
      
      // Add the OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(this.map);
      
      this.mapInitialized = true;
      
      // Force a resize to ensure map renders correctly
      setTimeout(() => {
        this.map?.invalidateSize();
      }, 100);
      
      // Update the map with location history if available
      if (this.locationHistory.length > 0) {
        this.updateMap();
      }
    } catch (error) {
      console.error('Error initializing map:', error);
      this.mapInitialized = false;
    }
  }

  private updateMap() {
    if (!this.map || this.locationHistory.length === 0) {
      return;
    }
    
    // Clear existing map layers
    this.map.eachLayer(layer => {
      if (layer instanceof L.TileLayer === false) {
        this.map?.removeLayer(layer);
      }
    });
    
    // Create a path from location history
    const points = this.locationHistory.map(loc => [loc.latitude, loc.longitude] as L.LatLngExpression);
    
    // Draw the path on the map
    const polyline = L.polyline(points, {
      color: '#2979FF',
      weight: 3
    }).addTo(this.map);
    
    // Add markers for start and end points
    if (this.locationHistory.length > 0) {
      const startLocation = this.locationHistory[0];
      const endLocation = this.locationHistory[this.locationHistory.length - 1];
      
      // Start marker with custom icon
      const startIcon = L.divIcon({
        className: 'custom-div-icon',
        html: '<div style="background-color:#4CAF50;width:16px;height:16px;border-radius:50%;border:2px solid white;"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      
      L.marker([startLocation.latitude, startLocation.longitude], {
        icon: startIcon,
        title: 'Start'
      }).addTo(this.map);
      
      // End marker with custom icon
      const endIcon = L.divIcon({
        className: 'custom-div-icon',
        html: '<div style="background-color:#F44336;width:16px;height:16px;border-radius:50%;border:2px solid white;"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      
      L.marker([endLocation.latitude, endLocation.longitude], {
        icon: endIcon,
        title: 'Current'
      }).addTo(this.map);
      
      // Fit the map to the bounds of the path
      this.map.fitBounds(polyline.getBounds());
    }
  }
}
