import type { PrinterProfile } from '@wcpos/printer';

import { printNeedsLoadedPreview } from './print-needs-loaded-preview';

// The package root pulls in ESM-only transports jest cannot parse; the two predicates
// under test are real, loaded from their own modules.
jest.mock('@wcpos/printer', () => ({
	isOrderBasedCloudProfile: jest.requireActual('@wcpos/printer/transport/cloud-adapter')
		.isOrderBasedCloudProfile,
	usesSystemPrintDialog: jest.requireActual('@wcpos/printer/transport/device-key')
		.usesSystemPrintDialog,
}));

function profile(overrides: Partial<PrinterProfile>): PrinterProfile {
	return {
		id: 'printer-1',
		name: 'Printer',
		connectionType: 'network',
		vendor: 'epson',
		address: '192.168.1.50',
		port: 9100,
		language: 'esc-pos',
		columns: 48,
		...overrides,
	} as PrinterProfile;
}

const receiptData = { id: 42 };

describe('printNeedsLoadedPreview', () => {
	it('does not need the frame for a raw/thermal profile with receipt data', () => {
		expect(
			printNeedsLoadedPreview({ printerProfile: profile({}), receiptData, html: undefined })
		).toBe(false);
		// A Windows spooler queue is connectionType 'system' but prints raw bytes.
		expect(
			printNeedsLoadedPreview({
				printerProfile: profile({ connectionType: 'system', address: 'winspool:Receipt' }),
				receiptData,
				html: undefined,
			})
		).toBe(false);
	});

	it('does not need the frame for an order-based cloud printer, even without receipt data', () => {
		expect(
			printNeedsLoadedPreview({
				printerProfile: profile({ connectionType: 'cloud', cloudProvider: 'epson-sdp' }),
				receiptData: undefined,
				html: undefined,
			})
		).toBe(false);
	});

	it('does not need the frame for the system dialog when the HTML is already rendered', () => {
		expect(
			printNeedsLoadedPreview({
				printerProfile: undefined,
				receiptData,
				html: '<html><body>Receipt</body></html>',
			})
		).toBe(false);
	});

	it('needs the frame for the system dialog when it must read the receipt page', () => {
		expect(
			printNeedsLoadedPreview({ printerProfile: undefined, receiptData, html: undefined })
		).toBe(true);
		expect(
			printNeedsLoadedPreview({
				printerProfile: profile({ connectionType: 'system', address: undefined }),
				receiptData,
				html: undefined,
			})
		).toBe(true);
	});

	it('needs the frame for a raw profile that falls back to the dialog for want of receipt data', () => {
		expect(
			printNeedsLoadedPreview({
				printerProfile: profile({}),
				receiptData: undefined,
				html: undefined,
			})
		).toBe(true);
	});
});
