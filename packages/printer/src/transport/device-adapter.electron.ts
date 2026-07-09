import { SerialElectronAdapter } from './serial-adapter.electron';
import { parseTarget } from './device-key';
import { UsbElectronAdapter } from './usb-adapter.electron';
import { WebBluetoothAdapter } from './webbluetooth-adapter';

import type { PrinterProfile, PrinterTransport } from '../types';

/**
 * Electron: USB via the main-process libusb path; OS-paired Bluetooth Classic via the
 * serial device path (macOS /dev/cu.*, Linux /dev/rfcomm*, Windows winspool:); BLE via
 * Chromium Web Bluetooth.
 */
export async function createDeviceTransport(profile: PrinterProfile): Promise<PrinterTransport> {
	if (!profile.address) {
		throw new Error(`Device profile is missing its device key for ${profile.name}`);
	}
	const target = parseTarget(profile.address);
	// Device-key routing wins over the stored connectionType for persisted profiles. This
	// preserves legacy outcomes where winspool:/serial: addresses route natively even if a
	// profile was saved from another tab label.
	if (target.kind === 'winspool') return new UsbElectronAdapter(profile.address);
	if (target.kind === 'serial') return new SerialElectronAdapter(profile.address);
	if (profile.connectionType === 'usb') return new UsbElectronAdapter(profile.address);
	if (profile.connectionType === 'bluetooth') return new WebBluetoothAdapter(profile.address);
	throw new Error(`Unsupported electron device connection type: ${profile.connectionType}`);
}
