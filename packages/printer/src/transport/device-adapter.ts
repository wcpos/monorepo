import { EpsonNativeAdapter } from './epson-native-adapter';
import { StarNativeAdapter } from './star-native-adapter';

import type { PrinterProfile, PrinterTransport } from '../types';

/** Native (iOS/Android): USB/Bluetooth via the vendor SDK adapters. */
export async function createDeviceTransport(profile: PrinterProfile): Promise<PrinterTransport> {
	if (profile.connectionType !== 'usb' && profile.connectionType !== 'bluetooth') {
		throw new Error(`Unsupported native printer connection type: ${profile.connectionType}`);
	}
	if (!profile.address) {
		throw new Error(`Native printer profile is missing an address for ${profile.name}`);
	}
	if (profile.vendor === 'epson') {
		return new EpsonNativeAdapter(profile.address, profile.connectionType);
	}
	if (profile.vendor === 'star') {
		return new StarNativeAdapter(
			profile.address,
			profile.connectionType,
			profile.nativeInterfaceType
		);
	}
	throw new Error(
		`Unsupported native printer vendor for ${profile.connectionType}: ${profile.vendor}`
	);
}
