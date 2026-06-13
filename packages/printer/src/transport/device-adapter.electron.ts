import { SerialElectronAdapter } from './serial-adapter.electron';
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
	// Spooler queues (Windows printers installed at the OS level, incl. paired Bluetooth
	// Classic printers) always print via the native winspool path — even when the profile
	// was created from the Bluetooth tab. Keep the prefix in sync with WINSPOOL_PREFIX in
	// apps/electron/src/main/winspool-printer.ts.
	if (profile.address.startsWith('winspool:')) return new UsbElectronAdapter(profile.address);
	// OS-paired Bluetooth Classic printers print over their serial device (macOS /dev/cu.*,
	// Linux /dev/rfcomm*) via the main process. Keep the prefix in sync with SERIAL_PREFIX
	// in apps/electron/src/main/serial-printer.ts.
	if (profile.address.startsWith('serial:')) return new SerialElectronAdapter(profile.address);
	if (profile.connectionType === 'usb') return new UsbElectronAdapter(profile.address);
	if (profile.connectionType === 'bluetooth') return new WebBluetoothAdapter(profile.address);
	throw new Error(`Unsupported electron device connection type: ${profile.connectionType}`);
}
