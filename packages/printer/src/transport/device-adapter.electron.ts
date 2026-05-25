import { UsbElectronAdapter } from './usb-adapter.electron';
import { WebBluetoothAdapter } from './webbluetooth-adapter';

import type { PrinterProfile, PrinterTransport } from '../types';

/** Electron: USB via the main-process libusb path; Bluetooth via Chromium Web Bluetooth. */
export async function createDeviceTransport(profile: PrinterProfile): Promise<PrinterTransport> {
	if (!profile.address) {
		throw new Error(`Device profile is missing its device key for ${profile.name}`);
	}
	if (profile.connectionType === 'usb') return new UsbElectronAdapter(profile.address);
	if (profile.connectionType === 'bluetooth') return new WebBluetoothAdapter(profile.address);
	throw new Error(`Unsupported electron device connection type: ${profile.connectionType}`);
}
