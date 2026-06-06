import type { PrinterProfile } from '@wcpos/printer';

import { mergeAvailablePrinterProfiles } from './available-printer-profiles';

const localPrinter: PrinterProfile = {
	id: 'local-1',
	name: 'Counter',
	connectionType: 'network',
	vendor: 'epson',
	address: '192.168.1.50',
	port: 9100,
	language: 'esc-pos',
	columns: 42,
	fullReceiptRaster: false,
	autoCut: true,
	autoOpenDrawer: false,
	isDefault: true,
	isBuiltIn: false,
};

describe('mergeAvailablePrinterProfiles', () => {
	it('returns local profiles, a built-in system target, and synthesized read-only cloud profiles', () => {
		const profiles = mergeAvailablePrinterProfiles([localPrinter], {
			printers: [
				{
					id: 'reg-7',
					name: 'Kitchen Cloud',
					provider: 'star-cloudprnt',
					columns: 48,
					language: 'esc-pos',
					autoCut: false,
					fullReceiptRaster: true,
				},
			],
		});

		expect(profiles.map((profile) => profile.id)).toEqual(['local-1', 'system', 'cloud:reg-7']);
		expect(profiles[2]).toMatchObject({
			id: 'cloud:reg-7',
			cloudPrinterId: 'reg-7',
			cloudProvider: 'star-cloudprnt',
			connectionType: 'cloud',
			isBuiltIn: true,
			vendor: 'star',
			columns: 48,
			language: 'esc-pos',
			autoCut: false,
			fullReceiptRaster: true,
		});
	});

	it('does not duplicate an already-present system target', () => {
		const systemPrinter: PrinterProfile = {
			...localPrinter,
			id: 'system',
			name: 'Print Dialog',
			connectionType: 'system',
			isBuiltIn: true,
		};

		const profiles = mergeAvailablePrinterProfiles([systemPrinter], []);

		expect(profiles.filter((profile) => profile.id === 'system')).toHaveLength(1);
	});
});
