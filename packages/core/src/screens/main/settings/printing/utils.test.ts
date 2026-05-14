import { printerIconName, templateTypeLabel } from './utils';

describe('printerIconName', () => {
	it('returns "desktop" for the built-in system dialog profile', () => {
		expect(printerIconName({ connectionType: 'system' })).toBe('desktop');
	});

	it('returns "printer" for a network profile', () => {
		expect(printerIconName({ connectionType: 'network' })).toBe('printer');
	});

	it('returns "printer" for bluetooth and usb profiles', () => {
		expect(printerIconName({ connectionType: 'bluetooth' })).toBe('printer');
		expect(printerIconName({ connectionType: 'usb' })).toBe('printer');
	});
});

describe('templateTypeLabel', () => {
	it('labels an escpos template with its paper width', () => {
		expect(templateTypeLabel({ output_type: 'escpos', paper_width: '80mm' })).toBe('ESC/POS 80mm');
	});

	it('labels an escpos template with no paper width as plain "ESC/POS"', () => {
		expect(templateTypeLabel({ output_type: 'escpos', paper_width: null })).toBe('ESC/POS');
	});

	it('labels a non-escpos template as "HTML"', () => {
		expect(templateTypeLabel({ output_type: 'html', paper_width: null })).toBe('HTML');
	});
});
