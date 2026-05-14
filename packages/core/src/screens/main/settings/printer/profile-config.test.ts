import { buildPrinterProfileFields } from './profile-config';

describe('buildPrinterProfileFields', () => {
	it('preserves discovered bluetooth connection types instead of forcing network', () => {
		expect(
			buildPrinterProfileFields(
				{
					name: 'Star BLE',
					vendor: 'star',
					address: '01:23:45:67:89:AB',
					port: 9100,
					language: 'star-prnt',
					columns: 48,
					emitEscPrintMode: true,
					fullReceiptRaster: false,
					autoCut: true,
					autoOpenDrawer: false,
					isDefault: false,
				},
				{
					prefill: {
						connectionType: 'bluetooth',
						nativeInterfaceType: 'BluetoothLE',
					},
				}
			)
		).toEqual(
			expect.objectContaining({
				connectionType: 'bluetooth',
				nativeInterfaceType: 'BluetoothLE',
			})
		);
	});

	it('preserves an existing usb printer connection type while editing', () => {
		expect(
			buildPrinterProfileFields(
				{
					name: 'Epson USB',
					vendor: 'epson',
					address: 'USB:device-1',
					port: 9100,
					language: 'esc-pos',
					columns: 48,
					emitEscPrintMode: true,
					fullReceiptRaster: false,
					autoCut: true,
					autoOpenDrawer: false,
					isDefault: false,
				},
				{
					printer: {
						connectionType: 'usb',
					},
				}
			)
		).toEqual(
			expect.objectContaining({
				connectionType: 'usb',
			})
		);
	});

	it('preserves explicit standard 42-column printer capacity', () => {
		expect(
			buildPrinterProfileFields({
				name: 'Generic 80mm',
				vendor: 'generic',
				address: '192.168.1.102',
				port: 9100,
				language: 'esc-pos',
				columns: 42,
				emitEscPrintMode: true,
				fullReceiptRaster: false,
				autoCut: true,
				autoOpenDrawer: false,
				isDefault: true,
			})
		).toEqual(
			expect.objectContaining({
				columns: 42,
			})
		);
	});

	it('preserves explicit wide 48-column printer capacity', () => {
		expect(
			buildPrinterProfileFields({
				name: 'Wide 80mm',
				vendor: 'epson',
				address: '192.168.1.103',
				port: 9100,
				language: 'esc-pos',
				columns: 48,
				emitEscPrintMode: true,
				fullReceiptRaster: false,
				autoCut: true,
				autoOpenDrawer: false,
				isDefault: false,
			})
		).toEqual(
			expect.objectContaining({
				columns: 48,
			})
		);
	});

	it('takes connectionType from form data over prefill', () => {
		expect(
			buildPrinterProfileFields(
				{
					name: 'Star BT manual',
					connectionType: 'bluetooth',
					vendor: 'star',
					address: '01:23:45:67:89:AB',
					port: 9100,
					language: 'star-prnt',
					columns: 48,
					emitEscPrintMode: true,
					fullReceiptRaster: false,
					autoCut: true,
					autoOpenDrawer: false,
					isDefault: false,
				},
				{ prefill: { connectionType: 'network' } }
			)
		).toEqual(expect.objectContaining({ connectionType: 'bluetooth' }));
	});

	it('defaults connectionType to network when form data omits it', () => {
		expect(
			buildPrinterProfileFields({
				name: 'Web Epson',
				vendor: 'epson',
				address: '192.168.1.100',
				port: 8008,
				language: 'esc-pos',
				columns: 42,
				emitEscPrintMode: true,
				fullReceiptRaster: false,
				autoCut: true,
				autoOpenDrawer: false,
				isDefault: true,
			})
		).toEqual(expect.objectContaining({ connectionType: 'network' }));
	});
});
