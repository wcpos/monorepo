/** @jest-environment jsdom */
import { deriveEndpointHint, deriveWebVendorDefaults } from './web-network-defaults';

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
});
