import type { BluetoothDevice } from './ble-gatt';

// Session-scoped: Electron keeps no Web Bluetooth permissions across sessions;
// the persisted descriptor in web-device-store stays the profile's identity.
const devices = new Map<string, BluetoothDevice>();
export const rememberBleDevice = (deviceKey: string, device: BluetoothDevice): void => {
	devices.set(deviceKey, device);
};
export const getBleDevice = (deviceKey: string): BluetoothDevice | undefined =>
	devices.get(deviceKey);
export const forgetBleDevice = (deviceKey: string): void => {
	devices.delete(deviceKey);
};
