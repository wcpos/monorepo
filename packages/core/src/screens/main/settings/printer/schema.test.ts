import { DEFAULT_FORM_VALUES, nativePrinterSchema } from './schema';

describe('printer schema code page', () => {
	it('defaults an unset code page to auto', () => {
		expect(DEFAULT_FORM_VALUES.codePage).toBe('auto');
		expect(
			nativePrinterSchema.parse({
				name: 'Counter',
				address: '192.168.1.100',
			}).codePage
		).toBe('auto');
	});

	it('keeps a chosen code page', () => {
		expect(
			nativePrinterSchema.parse({
				name: 'Counter',
				address: '192.168.1.100',
				codePage: 'windows1251',
			}).codePage
		).toBe('windows1251');
	});
});

it.each([
	['ble:ABC', true],
	['spp:00:11:22:33:44:55', true],
	['BT:00:11:22:33:44:55', false],
	['usb:1:2:3:4', false],
])('validates generic native lane %s: %s', (address, success) => {
	expect(
		nativePrinterSchema.safeParse({
			...DEFAULT_FORM_VALUES,
			name: 'BLE',
			vendor: 'generic',
			address,
			connectionType: address.startsWith('usb:') ? 'usb' : 'bluetooth',
		}).success
	).toBe(success);
});
