import type { DiscoveredPrinter } from '../types';
import type { PosConnectedDevice } from '../types/point-of-sale-connectors';

const HASH_FIELDS: (keyof PosConnectedDevice)[] = [
	'type',
	'language',
	'codepageMapping',
	'vendorId',
	'productId',
	'manufacturerName',
	'productName',
	'serialNumber',
	'name',
	'id',
];

function hashDevice(device: PosConnectedDevice): string {
	const stable = HASH_FIELDS.map((field) => `${field}:${device[field] ?? ''}`).join('|');
	let hash = 5381;
	for (let i = 0; i < stable.length; i += 1) {
		hash = (hash * 33) ^ stable.charCodeAt(i);
	}
	return (hash >>> 0).toString(36);
}

function deviceKey(device: PosConnectedDevice): string {
	if (device.serialNumber) return device.serialNumber;
	if (device.id) return device.id;
	const label = device.productName ?? device.name ?? device.type;
	return `${label}:${hashDevice(device)}`;
}

/** Map a connector `connected` descriptor to a DiscoveredPrinter. */
export function mapWebDeviceToDiscoveredPrinter(device: PosConnectedDevice): DiscoveredPrinter {
	const prefix = device.type === 'usb' ? 'webusb' : 'webbluetooth';
	const key = deviceKey(device);
	const id = `${prefix}:${key}`;
	return {
		id,
		name: device.productName ?? device.name ?? `${device.type} printer`,
		connectionType: device.type,
		address: id,
		vendor: device.language === 'star-prnt' ? 'star' : 'epson',
	};
}
