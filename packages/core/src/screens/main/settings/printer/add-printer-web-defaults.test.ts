/** @jest-environment jsdom */
import {
	deriveEndpointExplanation,
	deriveEndpointHint,
	deriveWebVendorDefaults,
	resolveWebPort,
} from './web-network-defaults';

describe('web printer network defaults', () => {
	it.each([
		['epson', 'https:', 8043],
		['epson', 'http:', 8008],
		['star', 'https:', 443],
		['star', 'http:', 80],
	] as const)('derives %s defaults on %s origins', (vendor, protocol, port) => {
		expect(deriveWebVendorDefaults(vendor, protocol)).toEqual({
			language: vendor === 'star' ? 'star-line' : 'esc-pos',
			port,
		});
	});

	it.each([
		['epson', 'https:', 8043, 'https://192.168.1.10:8043/cgi-bin/epos/service.cgi'],
		['epson', 'http:', 8008, 'http://192.168.1.10:8008/cgi-bin/epos/service.cgi'],
		['star', 'https:', 443, 'https://192.168.1.10:443/StarWebPRNT/SendMessage'],
		['star', 'http:', 80, 'http://192.168.1.10:80/StarWebPRNT/SendMessage'],
	] as const)(
		'shows the resolved %s endpoint on %s origins',
		(vendor, protocol, port, endpoint) => {
			expect(deriveEndpointHint(vendor, '192.168.1.10', port, protocol)).toBe(endpoint);
		}
	);

	it('uses https for an explicit Star HTTPS port even on an http origin', () => {
		expect(deriveEndpointHint('star', '192.168.1.10', 443, 'http:')).toBe(
			'https://192.168.1.10:443/StarWebPRNT/SendMessage'
		);
	});

	// Guard: must match resolveStarWebPrntUrl in
	// packages/printer/src/transport/network-adapter.web.ts
	it('keeps http for an explicit Star port 80 even on an https origin', () => {
		expect(deriveEndpointHint('star', '192.168.1.10', 80, 'https:')).toBe(
			'http://192.168.1.10:80/StarWebPRNT/SendMessage'
		);
	});

	it('keeps http for an explicit Epson port 8008 even on an https origin', () => {
		expect(deriveEndpointHint('epson', '192.168.1.10', 8008, 'https:')).toBe(
			'http://192.168.1.10:8008/cgi-bin/epos/service.cgi'
		);
	});
});

describe('resolveWebPort', () => {
	// Regression: a printer discovered at raw TCP localhost:9100 used to leave
	// 9100 in the Port field while the request silently went to 8043.
	it('maps raw TCP 9100 to the vendor web port for the origin', () => {
		expect(resolveWebPort('epson', 9100, 'https:')).toBe(8043);
		expect(resolveWebPort('epson', 9100, 'http:')).toBe(8008);
		expect(resolveWebPort('star', 9100, 'https:')).toBe(443);
		expect(resolveWebPort('star', 9100, 'http:')).toBe(80);
	});

	it('maps a missing port to the vendor web port', () => {
		expect(resolveWebPort('epson', undefined, 'http:')).toBe(8008);
	});

	it('passes explicit web ports through unchanged', () => {
		expect(resolveWebPort('epson', 8008, 'https:')).toBe(8008);
		expect(resolveWebPort('star', 8008, 'https:')).toBe(8008);
	});
});

describe('deriveEndpointExplanation', () => {
	it('explains HTTPS endpoints on secure origins', () => {
		expect(deriveEndpointExplanation('epson', '192.168.1.10', 8043, 'https:')).toBe(
			'Using Epson ePOS over HTTPS because this page is secure and port 8043 is selected. The printer needs an SSL certificate this browser trusts.'
		);
	});

	it('explains HTTP endpoints and the local-network permission', () => {
		expect(deriveEndpointExplanation('star', 'localhost', 8008, 'https:')).toBe(
			'Using Star WebPRNT over HTTP. Chrome or Edge may ask for permission to access your local network.'
		);
	});

	it('returns nothing without an address', () => {
		expect(deriveEndpointExplanation('epson', '  ', 8043, 'https:')).toBeUndefined();
	});
});
