import * as Device from 'expo-device';
import * as ScreenOrientation from 'expo-screen-orientation';
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

/** Il player è sempre orizzontale (il telefono può girarlo da un lato o dall'altro). */
export async function lockPlayerOrientation() {
  if (Platform.isTV) return;
  await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
}
