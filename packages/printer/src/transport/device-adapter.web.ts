import { WebBluetoothAdapter } from './webbluetooth-adapter';
import { WebUsbAdapter } from './webusb-adapter';

import type { PrinterProfile, PrinterTransport } from '../types';

/** Web: USB via WebUSB, Bluetooth via Web Bluetooth (Chromium desktop/Android). */
export async function createDeviceTransport(profile: PrinterProfile): Promise<PrinterTransport> {
	if (!profile.address) {
		throw new Error(`Web device profile is missing its device key for ${profile.name}`);
	}
	// profile.address holds the device key (e.g. "webusb:SN123"), carried from the
	// DiscoveredPrinter through the add flow — the same key the descriptor is stored under.
	if (profile.connectionType === 'usb') return new WebUsbAdapter(profile.address);
	if (profile.connectionType === 'bluetooth') return new WebBluetoothAdapter(profile.address);
	throw new Error(`Unsupported web device connection type: ${profile.connectionType}`);
}
