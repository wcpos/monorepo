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

	it.each([
		"Could not connect to Epson printer at https://192.168.1.50:8043/cgi-bin/epos/service.cgi. The printer did not respond on Epson's HTTPS ePOS port. 1. Check the IP address and ensure ePOS is enabled. 2. HTTPS requires an SSL certificate on the printer — generate a self-signed certificate in the printer's web configuration, then visit https://192.168.1.50:8043 in this browser and accept the certificate warning. 3. If the printer only supports HTTP, set the port to 8008 and use Chrome or Edge with local network access permission.",
		"Could not connect to Epson printer at http://192.168.1.50:8008/cgi-bin/epos/service.cgi. The printer did not respond on Epson's HTTP ePOS port, or the browser blocked the request. 1. Check the IP address and ensure ePOS is enabled. 2. If your browser asked for permission to access devices on your local network, choose Allow and try again. 3. Plain-HTTP printing from a secure (HTTPS) page requires Chrome or Edge 142 or newer — other browsers block it. Otherwise, enable HTTPS on the printer instead.",
		'Could not connect to Epson printer at http://192.168.1.50:8008/cgi-bin/epos/service.cgi. The printer did not answer at http://192.168.1.50:8008/cgi-bin/epos/service.cgi before the request timed out. 1. Check that the printer is powered on and reachable at 192.168.1.50. 2. Confirm the IP address and port, and ensure ePOS is enabled.',
	])(
		'reads a web connection failure as a printer that did not answer, not a permission (#3370) — %s',
		(message) => {
			expect(describePrinterError(new Error(message)).key).toBe('settings.setup_err_timeout');
		}
	);

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
