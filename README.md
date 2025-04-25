# 🛰️ Location Tracker App - Ionic + Angular + Capacitor

This app is a real-time location tracking application built with **Ionic Framework**, **Angular**, and **Capacitor**. It tracks user location in the foreground, background, and even when the app is closed or the device is locked. The app features a flexible settings panel and a full location history view similar to Google Maps Timeline.

---

## 🔧 Features

- 🌍 **Real-time location tracking**
- 🛑 **Works in background and after app kill**
- ⚙️ **Customizable tracking settings**
  - Enable/Disable tracking
  - Background tracking toggle
  - Tracking interval (in seconds)
  - Accuracy level (High/Medium/Low)
  - Geofence radius (meters)
  - Show/Hide background notification
  - Request permissions
  - Show stored locations on map
  - Clear stored data
- 🗺️ **Location history view**
  - Path on map
  - Total distance (KM)
  - Total time taken
  - Start and end timestamps
- 🔔 **User alerts**
  - Notify when location is not tracked for a certain duration
  - Notify if GPS/location services are turned off
- 💾 **Offline data storage and sync**

---

## 🧩 Tech Stack

- [Ionic Framework](https://ionicframework.com/)
- [Angular](https://angular.io/)
- [Capacitor](https://capacitorjs.com/)
- Plugins:
  - `@capacitor/geolocation`
  - `@capacitor/background-task`
  - `@capacitor/local-notifications`
  - `cordova-plugin-background-geolocation`

---

## 📱 Pages

1. **Tracking Settings Page**
   - Controls all tracking behavior and permissions.
2. **Location History Page**
   - Shows user travel history with map, distance, and time insights.

---
