/**
 * The site-address comparisons the connect flow uses to tell "same site" from a clash.
 * Moved from core's use-site-connect test when `@wcpos/query/user-db` stopped exporting them.
 */
import { connectionAddressOf, normalizeSiteAddress } from '../../src/user-db/sites';
import { URL_IMPLEMENTATIONS, withGlobalUrl } from '../../../core/jest/url-implementations';

describe('normalizeSiteAddress', () => {
	it.each([
		['https://example.com', 'http://example.com', true],
		['https://Example.com', 'https://example.com', true],
		['https://example.com/', 'https://example.com', true],
		['https://example.com/staging', 'https://example.com', false],
		['https://example.com/Staging', 'https://example.com/staging', false],
	])('compares %s with %s: same address = %s', (saved, incoming, same) => {
		expect(normalizeSiteAddress(saved) === normalizeSiteAddress(incoming)).toBe(same);
	});

	describe.each(URL_IMPLEMENTATIONS)('%s', (_, impl) => {
		withGlobalUrl(impl);

		it.each([
			['https://münchen-laden.de/', 'xn--mnchen-laden-dlb.de', true],
			['https://Bücher.example/shop', 'https://xn--bcher-kva.example/shop/', true],
			['https://bücher.example:443/shop', 'https://xn--bcher-kva.example:443/shop', true],
		])('compares %s with %s: same address = %s', (saved, incoming, same) => {
			expect(normalizeSiteAddress(saved) === normalizeSiteAddress(incoming)).toBe(same);
		});
	});
});

describe('connectionAddressOf', () => {
	it.each([
		['https://example.com/wp-json/wcpos/v2/', 'example.com'],
		['http://Example.com/?rest_route=/wcpos/v2/', 'example.com'],
		['https://example.com/staging/wp-json/wcpos/v2/', 'example.com/staging'],
		['https://192.168.1.5:8080/wp-json/wcpos/v2/', '192.168.1.5:8080'],
		['https://münchen-laden.de/wp-json/', 'xn--mnchen-laden-dlb.de'],
		[undefined, ''],
	])('reduces %s to the address reached, %s', (apiUrl, address) => {
		expect(connectionAddressOf(apiUrl)).toBe(address);
	});
});
