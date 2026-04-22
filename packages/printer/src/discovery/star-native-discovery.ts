import type { DiscoveredPrinter } from '../types';

interface StarDiscoveryPrinter {
	connectionSettings?: {
		identifier?: string;
		interfaceType?: string;
	};
	information?: {
		model?: {
			identifier?: string;
		};
	};
}

export function mapStarDiscoveryPrinter(printer: StarDiscoveryPrinter): DiscoveredPrinter {
	const identifier = printer.connectionSettings?.identifier ?? '';
	const interfaceType = printer.connectionSettings?.interfaceType ?? '';
	const model = printer.information?.model?.identifier ?? 'Star Printer';

	const normalizedInterfaceType = interfaceType.toLowerCase();
	const connectionType = normalizedInterfaceType.includes('usb')
		? ('usb' as const)
		: normalizedInterfaceType.includes('bluetooth')
			? ('bluetooth' as const)
			: ('network' as const);

	return {
		id: `star-${identifier}`,
		name: model,
		connectionType,
		address: identifier,
		port: connectionType === 'network' ? 9100 : undefined,
		vendor: 'star',
	};
}

/**
 * Discover Star printers using the react-native-star-io10 SDK.
 *
 * This module is loaded via dynamic import, so it only runs if the
 * peer dependency is installed. The import will throw if the package
 * is not available, and the caller catches that.
 */
export async function discover(): Promise<DiscoveredPrinter[]> {
	const { StarDeviceDiscoveryManagerFactory, InterfaceType } =
		await import('react-native-star-io10');

	const manager = await StarDeviceDiscoveryManagerFactory.create([
		InterfaceType.Lan,
		InterfaceType.Bluetooth,
		InterfaceType.BluetoothLE,
		InterfaceType.Usb,
	]);

	const printers: DiscoveredPrinter[] = [];

	return new Promise((resolve) => {
		manager.discoveryTime = 10_000;

		manager.onPrinterFound = (printer: any) => {
			const discoveredPrinter = mapStarDiscoveryPrinter(printer);
			if (!printers.some((existing) => existing.id === discoveredPrinter.id)) {
				printers.push(discoveredPrinter);
			}
		};

		manager.onDiscoveryFinished = () => {
			resolve(printers);
		};

		manager.startDiscovery().catch(() => {
			resolve(printers);
		});
	});
}
