import { buildConnectionError } from '@wcpos/printer/utils/connection-error';

import { describePrinterError, printerErrorText } from './describe-printer-error';
import en from '../../../../contexts/translations/locales/en/core.json';

jest.mock('@wcpos/printer', () => jest.requireActual('@wcpos/printer/utils/connection-error'));

const catalogue = en as Record<string, string>;
const connectionOptions = {
	vendorLabel: 'Epson',
	protocolName: 'ePOS',
	url: 'http://192.168.1.10:8008/cgi-bin/epos/service.cgi',
	enableHint: 'ensure ePOS is enabled on the printer',
	plainHttpPort: 8008,
};

describe('describePrinterError', () => {
	it('an unreachable network printer is not a permission problem', () => {
		const error = buildConnectionError(connectionOptions);
		expect(error.message).toContain('permission');
		expect(describePrinterError(error)).toEqual({
			key: 'settings.setup_err_unreachable',
			message: error.message,
		});
		expect(printerErrorText('settings.setup_err_unreachable', (key) => catalogue[key])).toBe(
			catalogue['settings.setup_err_unreachable']
		);
	});

	it('a timed-out network printer keeps the did-not-answer line', () => {
		const error = buildConnectionError({ ...connectionOptions, reason: 'timeout' });
		expect(describePrinterError(error).key).toBe('settings.setup_err_timeout');
		// Structured diagnostics take precedence over the message text.
		error.message = 'permission denied';
		expect(describePrinterError(error)).toEqual({
			key: 'settings.setup_err_timeout',
			message: error.message,
		});
	});

	it('a serialised connection error is classified by its text', () => {
		const error = buildConnectionError(connectionOptions);
		expect(describePrinterError(new Error(error.message)).key).toBe(
			'settings.setup_err_unreachable'
		);
		const timeout = buildConnectionError({ ...connectionOptions, reason: 'timeout' });
		expect(describePrinterError(new Error(timeout.message)).key).toBe('settings.setup_err_timeout');
	});

	it('a real permission error still says so', () => {
		expect(describePrinterError(new Error('LIBUSB_ERROR_ACCESS')).key).toBe(
			'settings.setup_err_permission'
		);
	});

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
			'err_unreachable',
			'err_refused',
			'err_generic',
		].map((name) => `settings.setup_${name}`);

		for (const key of keys) {
			expect(catalogue[key]).toBeDefined();
			expect(catalogue[key]).not.toMatch(/\n/);
		}
	});
});
