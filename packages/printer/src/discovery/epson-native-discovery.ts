import type { DiscoveredPrinter } from '../types';

interface EpsonDiscoveryDevice {
	target: string;
	deviceName: string;
	ipAddress?: string;
	macAddress?: string;
	bdAddress?: string;
}

export function mapEpsonDiscoveryDevice(device: EpsonDiscoveryDevice): DiscoveredPrinter {
	const normalizedTarget = device.target.trim();
	const upperTarget = normalizedTarget.toUpperCase();

	if (upperTarget.startsWith('TCP:')) {
		const address = device.ipAddress || normalizedTarget.replace(/^TCP:/i, '').trim();

		return {
			id: `epson-${address}:9100`,
			name: device.deviceName || `Epson (${address})`,
			connectionType: 'network',
			address,
			port: 9100,
			vendor: 'epson',
		};
	}

	if (upperTarget.startsWith('USB:')) {
		return {
			id: `epson-${normalizedTarget.toLowerCase()}`,
			name: device.deviceName || 'Epson USB Printer',
			connectionType: 'usb',
			address: normalizedTarget,
			port: undefined,
			vendor: 'epson',
		};
	}

	return {
		id: `epson-${normalizedTarget.toLowerCase()}`,
		name: device.deviceName || `Epson (${device.bdAddress || normalizedTarget})`,
		connectionType: 'bluetooth',
		address: normalizedTarget,
		port: undefined,
		vendor: 'epson',
	};
}

/**
 * Discover Epson printers using the react-native-esc-pos-printer SDK.
 *
 * This module is loaded via dynamic import, so it only runs if the
 * peer dependency is installed. The import will throw if the package
 * is not available, and the caller catches that.
 */
export async function discover(): Promise<DiscoveredPrinter[]> {
	const { PrintersDiscovery } = await import('react-native-esc-pos-printer');

	const found: DiscoveredPrinter[] = [];

	return new Promise((resolve) => {
		const unsubscribe = PrintersDiscovery.onDiscovery(
			(printers: { target: string; deviceName: string }[]) => {
				for (const device of printers) {
					const printer = mapEpsonDiscoveryDevice(device);
					if (!found.some((p) => p.id === printer.id)) {
						found.push(printer);
					}
				}
			}
		);

		PrintersDiscovery.start({ timeout: 10_000, autoStop: true }).catch(() => {
			// Resolve with whatever we found
		});

		// Give discovery 10 seconds then return results
		setTimeout(() => {
			unsubscribe();
			PrintersDiscovery.stop().catch(() => {});
			resolve(found);
		}, 10_000);
	});
}
