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
					enableLegacyPrintMode: true,
					autoPrint: false,
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
					enableLegacyPrintMode: true,
					autoPrint: false,
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
				enableLegacyPrintMode: true,
				autoPrint: false,
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
				enableLegacyPrintMode: true,
				autoPrint: false,
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
});
