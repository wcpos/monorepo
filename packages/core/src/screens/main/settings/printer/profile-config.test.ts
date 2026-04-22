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
});
