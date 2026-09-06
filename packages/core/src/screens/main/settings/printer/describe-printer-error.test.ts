import { describePrinterError } from './describe-printer-error';
import en from '../../../../contexts/translations/locales/en/core.json';

const catalogue = en as Record<string, string>;

describe('describePrinterError', () => {
	it.each([
		["Error invoking remote method 'printer:write'", 'settings.setup_err_bridge'],
		['USB printing is not supported on Windows', 'settings.setup_err_windows_usb'],
		['LIBUSB_ERROR_ACCESS', 'settings.setup_err_permission'],
		['EACCES: permission denied', 'settings.setup_err_permission'],
		['Unsupported native printer vendor: brother', 'settings.setup_err_unsupported'],
		['Printer profile is missing its device key', 'settings.setup_err_reconnect'],
		['Bluetooth device is not connected', 'settings.setup_err_reconnect'],
		['ASB status: CoverOpen', 'settings.setup_err_paper'],
		['PaperEnd', 'settings.setup_err_paper'],
		['Connection timed out', 'settings.setup_err_timeout'],
		['ETIMEDOUT', 'settings.setup_err_timeout'],
		['connect ECONNREFUSED 192.168.1.10:9100', 'settings.setup_err_refused'],
		['Something nobody has seen before', 'settings.setup_err_generic'],
	])('maps %s to %s', (message, key) => {
		expect(describePrinterError(new Error(message)).key).toBe(key);
	});

	it('keeps the raw message so the support report still carries it', () => {
		expect(describePrinterError(new Error('ETIMEDOUT'))).toEqual({
			key: 'settings.setup_err_timeout',
			message: 'ETIMEDOUT',
		});
		expect(describePrinterError('plain string').message).toBe('plain string');
	});

	it('resolves every key it can return to one line of English', () => {
		const keys = [
			'err_bridge',
			'err_windows_usb',
			'err_permission',
			'err_unsupported',
			'err_reconnect',
			'err_paper',
			'err_timeout',
			'err_refused',
			'err_generic',
		].map((name) => `settings.setup_${name}`);

		for (const key of keys) {
			expect(catalogue[key]).toBeDefined();
			expect(catalogue[key]).not.toMatch(/\n/);
		}
	});
});
