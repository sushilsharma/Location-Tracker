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
      // Check if we have permission
      const permResult = await LocalNotifications.checkPermissions();
      
      if (permResult.display !== 'granted') {
        const request = await LocalNotifications.requestPermissions();
        if (request.display !== 'granted') {
          console.log('Notification permission not granted');
          return;
        }
      }
      
      // Show notification
      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: Math.floor(Math.random() * 100),
            schedule: { at: new Date(Date.now()) },
            sound: undefined,
            attachments: undefined,
            actionTypeId: '',
            extra: null
          }
        ]
      });
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  // New method for persistent tracking notification
  async showTrackingNotification(isTracking: boolean): Promise<void> {
    try {
      if (!this.platform.is('capacitor')) {
        return; // Only show notifications on real devices
      }
      
      if (isTracking) {
        // Show persistent notification for tracking
        await LocalNotifications.schedule({
          notifications: [
            {
              title: 'Location Tracking Active',
              body: 'Your location is being tracked in the background',
              id: this.TRACKING_NOTIFICATION_ID,
              ongoing: true, // Makes the notification persistent
              autoCancel: false,
              sound: undefined,
              attachments: undefined,
              actionTypeId: '',
              extra: { tracking: 'active' }
            }
          ]
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
