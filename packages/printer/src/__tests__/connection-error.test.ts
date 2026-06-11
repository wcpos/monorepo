import { describe, expect, it } from 'vitest';

import { buildConnectionError, isPrinterConnectionError } from '../utils/connection-error';

describe('buildConnectionError', () => {
	it('suggests the local-network permission for plain-HTTP endpoints', () => {
		const error = buildConnectionError({
			vendorLabel: 'Star',
			protocolName: 'WebPRNT',
			url: 'http://192.168.0.25:80/StarWebPRNT/SendMessage',
			enableHint: 'ensure WebPRNT is enabled on the printer',
			plainHttpPort: 80,
		});
		expect(error.message).toContain('http://192.168.0.25:80/StarWebPRNT/SendMessage');
		expect(error.message).toContain('ensure WebPRNT is enabled on the printer');
		expect(error.message).toContain('permission to access devices on your local network');
		expect(error.message).toContain('Chrome or Edge');
		expect(error.message).not.toContain('certificate');
		expect(error.diagnostics).toMatchObject({
			vendorLabel: 'Star',
			attemptLabel: 'Star WebPRNT over HTTP',
			host: '192.168.0.25',
			port: 80,
			scheme: 'http',
		});
	});

	it('explains certificate setup for HTTPS endpoints on real printers', () => {
		const error = buildConnectionError({
			vendorLabel: 'Star',
			protocolName: 'WebPRNT',
			url: 'https://192.168.4.60:443/StarWebPRNT/SendMessage',
			enableHint: 'ensure WebPRNT is enabled on the printer',
			plainHttpPort: 80,
		});
		expect(error.message).toContain('generate a self-signed certificate');
		expect(error.message).toContain('https://192.168.4.60');
		expect(error.message).toContain('set the port to 80');
		expect(error.diagnostics.attemptLabel).toBe('Star WebPRNT over HTTPS');
	});

	it('uses the vendor plain-HTTP port in the HTTPS fallback hint', () => {
		const error = buildConnectionError({
			vendorLabel: 'Epson',
			protocolName: 'ePOS',
			url: 'https://192.168.1.10:8043/cgi-bin/epos/service.cgi',
			enableHint: "ensure ePOS is enabled in the printer's network settings",
			plainHttpPort: 8008,
		});
		expect(error.message).toContain('visit https://192.168.1.10:8043 in this browser');
		expect(error.message).toContain('set the port to 8008');
	});

	// The confusing scenario from support: scan finds localhost, the form derives
	// https://localhost:8043, and the old message led with real-printer certificate
	// advice. On localhost the virtual printer (plain HTTP) must come first.
	it('leads with the virtual-printer HTTP hint for HTTPS failures on localhost', () => {
		const error = buildConnectionError({
			vendorLabel: 'Epson',
			protocolName: 'ePOS',
			url: 'https://localhost:8043/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000',
			enableHint: "ensure ePOS is enabled in the printer's network settings",
			plainHttpPort: 8008,
			cause: new TypeError('Failed to fetch'),
		});
		expect(error.diagnostics.suggestions[0]).toContain('local virtual printer');
		expect(error.diagnostics.suggestions[0]).toContain('8008');
		expect(error.diagnostics.suggestions[0]).not.toContain('certificate');
		expect(error.diagnostics.host).toBe('localhost');
		expect(error.diagnostics.errorDetail).toBe('TypeError: Failed to fetch');
	});

	it('describes timeouts distinctly', () => {
		const error = buildConnectionError({
			vendorLabel: 'Epson',
			protocolName: 'ePOS',
			url: 'http://192.168.1.10:8008/cgi-bin/epos/service.cgi',
			enableHint: "ensure ePOS is enabled in the printer's network settings",
			plainHttpPort: 8008,
			reason: 'timeout',
		});
		expect(error.diagnostics.likelyReason).toContain('timed out');
		expect(error.message).toContain('powered on');
	});

	it('is recognizable via the isPrinterConnectionError guard', () => {
		const error = buildConnectionError({
			vendorLabel: 'Epson',
			protocolName: 'ePOS',
			url: 'http://192.168.1.10:8008/cgi-bin/epos/service.cgi',
			enableHint: "ensure ePOS is enabled in the printer's network settings",
			plainHttpPort: 8008,
		});
		expect(isPrinterConnectionError(error)).toBe(true);
		expect(isPrinterConnectionError(new Error('plain'))).toBe(false);
	});
});
