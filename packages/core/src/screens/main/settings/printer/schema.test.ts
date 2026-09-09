import { DEFAULT_FORM_VALUES, genericVendorAllowed, nativePrinterSchema } from './schema';

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

// The generic exception is the Bluetooth lane AND a ble:/spp: address; either alone is an SDK row.
it.each([
	['bluetooth', 'ble:ABC', true],
	['bluetooth', 'spp:00:11:22:33:44:55', true],
	['bluetooth', 'BT:00:11:22:33:44:55', false],
	['bluetooth', 'ble:', false],
	['usb', 'usb:1:2:3:4', false],
	['usb', 'ble:ABC', false],
	['network', '192.168.1.10', true],
] as const)('generic vendor on native %s %s: %s', (connectionType, address, allowed) => {
	expect(genericVendorAllowed(connectionType, address)).toBe(allowed);
	expect(
		nativePrinterSchema.safeParse({
			...DEFAULT_FORM_VALUES,
			name: 'Printer',
			vendor: 'generic',
			address,
			connectionType,
		}).success
	).toBe(allowed);
});
