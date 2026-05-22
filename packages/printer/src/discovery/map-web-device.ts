import type { DiscoveredPrinter } from '../types';
import type { PosConnectedDevice } from '../types/point-of-sale-connectors';

/** Map a connector `connected` descriptor to a DiscoveredPrinter. */
export function mapWebDeviceToDiscoveredPrinter(device: PosConnectedDevice): DiscoveredPrinter {
	const prefix = device.type === 'usb' ? 'webusb' : 'webbluetooth';
	const key = device.serialNumber ?? device.id ?? device.productName ?? device.name ?? 'unknown';
	const id = `${prefix}:${key}`;
	return {
		id,
		name: device.productName ?? device.name ?? `${device.type} printer`,
		connectionType: device.type,
		address: id,
		vendor: device.language === 'star-prnt' ? 'star' : 'epson',
	};
}
