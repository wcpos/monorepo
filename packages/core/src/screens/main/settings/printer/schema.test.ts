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
