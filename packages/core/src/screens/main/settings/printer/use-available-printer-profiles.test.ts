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

	it('normalizes the legacy built-in system target into the current system target', () => {
		const legacySystemPrinter: PrinterProfile = {
			...localPrinter,
			id: '__system__',
			name: 'Print Dialog',
			connectionType: 'system',
			isDefault: true,
			isBuiltIn: true,
		};

		const profiles = mergeAvailablePrinterProfiles([legacySystemPrinter], []);

		expect(profiles.map((profile) => profile.id)).toEqual(['system']);
		expect(profiles[0]).toMatchObject({
			id: 'system',
			connectionType: 'system',
			isDefault: true,
			isBuiltIn: true,
		});
	});

	it('normalizes a single cloud printer payload object to an array', () => {
		const profiles = mergeAvailablePrinterProfiles([localPrinter], {
			printers: {
				id: 'reg-8',
				name: 'Back Bar Cloud',
			},
		});

		expect(profiles.map((profile) => profile.id)).toEqual(['local-1', 'system', 'cloud:reg-8']);
	});

	it('normalizes keyed cloud printer payload objects returned by persisted server settings', () => {
		const profiles = mergeAvailablePrinterProfiles([localPrinter], {
			printers: {
				'reg-9': {
					name: 'Kitchen Cloud',
				},
				'reg-10': {
					name: 'Bar Cloud',
				},
			},
		});

		expect(profiles.map((profile) => profile.id)).toEqual([
			'local-1',
			'system',
			'cloud:reg-9',
			'cloud:reg-10',
		]);
	});
});
