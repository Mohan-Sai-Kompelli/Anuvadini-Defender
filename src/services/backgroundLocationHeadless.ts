import BackgroundService from 'react-native-background-actions';
import Geolocation from 'react-native-geolocation-service';
import { apiService } from './api';

const sleep = (timeMs: number) => new Promise(resolve => setTimeout(resolve, timeMs));
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export const backgroundLocationHeadlessTask = async (taskData: { intervalMs?: number }) => {
  const intervalMs = taskData?.intervalMs || DEFAULT_INTERVAL_MS;

  while (BackgroundService.isRunning()) {
    await new Promise<void>((resolve) => {
      Geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude, accuracy, heading, speed } = position.coords;
            await apiService.updateLiveLocation({
              latitude,
              longitude,
              accuracy,
              heading,
              speed,
              timestamp: position.timestamp,
            });
          } catch (error) {
            console.warn('Background headless update failed:', error);
          } finally {
            resolve();
          }
        },
        (error) => {
          console.warn('Background headless location error:', error);
          resolve();
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
          forceRequestLocation: true,
          showLocationDialog: false,
        }
      );
    });

    await sleep(intervalMs);
  }
};

export default backgroundLocationHeadlessTask;
