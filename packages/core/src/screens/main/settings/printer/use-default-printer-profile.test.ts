import type { PrinterProfileDocument } from '@wcpos/database';

import { toPrinterProfile } from './use-default-printer-profile';

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: jest.fn(),
}));

describe('toPrinterProfile', () => {
	it('propagates cloudPrinterId for cloud profiles', () => {
		const profile = toPrinterProfile({
			id: 'cloud-1',
			name: 'Kitchen (cloud)',
			connectionType: 'cloud',
			vendor: 'generic',
			port: 9100,
			language: 'esc-pos',
			columns: 42,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: false,
			isBuiltIn: false,
			cloudPrinterId: 'plugin-printer-7',
		} as unknown as PrinterProfileDocument);

		expect(profile.cloudPrinterId).toBe('plugin-printer-7');
		expect(profile.connectionType).toBe('cloud');
	});
});
