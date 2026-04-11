import type { DiscoveredPrinter } from '../types';

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
					const address = device.target.replace(/^TCP:/i, '').trim();
					const id = `epson-${address}:9100`;
					if (!found.some((p) => p.id === id)) {
						found.push({
							id,
							name: device.deviceName || `Epson (${address})`,
							connectionType: 'network',
							address,
							port: 9100,
							vendor: 'epson',
						});
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
