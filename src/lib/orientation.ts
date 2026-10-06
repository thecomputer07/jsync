import * as Device from 'expo-device';
import * as ScreenOrientation from 'expo-screen-orientation';
import { DeviceMotion } from 'expo-sensors';
import { Platform } from 'react-native';

/** Telefoni in verticale fuori dal player; tablet e TV liberi. */
export async function lockAppOrientation() {
  if (Platform.isTV) return;
  const type = await Device.getDeviceTypeAsync().catch(() => Device.DeviceType.PHONE);
  if (type === Device.DeviceType.PHONE) {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  } else {
    await ScreenOrientation.unlockAsync().catch(() => {});
  }
}

/** Nel player lo schermo segue il telefono (verticale o orizzontale). */
export async function unlockPlayerOrientation() {
  if (Platform.isTV) return;
  await ScreenOrientation.unlockAsync().catch(() => {});
}

/**
 * Lato orizzontale in cui è girato il telefono, letto dai sensori: su iOS né il modulo di rotazione
 * (scavalcato da react-native-screens) né le dimensioni dicono il lato.
 * Senza permesso o senza lettura entro 1 s: `landscape`, cioè entrambi i lati.
 */
export async function landscapeSide(): Promise<'landscape_left' | 'landscape_right' | 'landscape'> {
  const perm = await DeviceMotion.requestPermissionsAsync().catch(() => null);
  if (!perm?.granted) return 'landscape';
  return new Promise((resolve) => {
    const sub = DeviceMotion.addListener((m) => {
      clearTimeout(timer);
      sub.remove();
      // I sensori danno il lato del telefono, le schermate quello dell'interfaccia: sono invertiti.
      resolve(m.orientation === 90 ? 'landscape_left' : m.orientation === -90 ? 'landscape_right' : 'landscape');
    });
    const timer = setTimeout(() => {
      sub.remove();
      resolve('landscape');
    }, 1000);
  });
}
