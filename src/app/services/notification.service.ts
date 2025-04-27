import { Injectable } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Platform } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private TRACKING_NOTIFICATION_ID = 999;
  
  constructor(private platform: Platform) {}

  async showNotification(title: string, body: string): Promise<void> {
    try {
      if (!this.platform.is('capacitor')) {
        return; // Only show notifications on real devices
      }

      await LocalNotifications.schedule({
        notifications: [{
          title,
          body,
          id: Math.floor(Math.random() * 100),
          schedule: { at: new Date(Date.now()) }
        }]
      });
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  async showTrackingNotification(isTracking: boolean): Promise<void> {
    try {
      if (!this.platform.is('capacitor')) {
        return; // Only show notifications on real devices
      }

      if (isTracking) {
        // First ensure we have the right notification channel on Android
        if (this.platform.is('android')) {
          try {
            await LocalNotifications.createChannel({
              id: 'location-tracking',
              name: 'Location Tracking',
              description: 'Used for background location tracking notifications',
              importance: 4,
              visibility: 1,
              vibration: false,
              lights: false
            });
          } catch (channelError) {
            console.warn('Could not create notification channel:', channelError);
          }
        }

        // Schedule the persistent notification
        await LocalNotifications.schedule({
          notifications: [{
            title: 'Location Tracking Active',
            body: 'Your location is being tracked in the background',
            id: this.TRACKING_NOTIFICATION_ID,
            channelId: this.platform.is('android') ? 'location-tracking' : undefined,
            ongoing: true,
            autoCancel: false,
            schedule: { at: new Date(Date.now()) }
          }]
        });
      } else {
        // Cancel the tracking notification
        await LocalNotifications.cancel({
          notifications: [{ id: this.TRACKING_NOTIFICATION_ID }]
        });
      }
    } catch (error) {
      console.error('Error with tracking notification:', error);
    }
  }
}
