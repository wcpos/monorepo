import { Observable, of } from 'rxjs';
import wcApiService from './wc-auth';
import mockHeaders from '../../jest/__fixtures__/wp-headers.json';
import mockWpApiIndex from '../../jest/__fixtures__/wp-json-index.json';
import mockWcApiIndex from '../../jest/__fixtures__/wc-api-index.json';

jest.mock('../lib/http', () => {
	return {
		head: (url) => {
			return new Promise((resolve, reject) => {
				process.nextTick(() => resolve({ headers: mockHeaders }));
			});
		},
		get: (url) => {
			return new Promise((resolve, reject) => {
				let data = null;
				if (url === 'http://example.com/wp-json/') {
					data = mockWpApiIndex;
				}
				process.nextTick(() => resolve({ data }));
			});
		},
	};
});

describe('WooCommerce Auth Service', () => {
	it('fetchWpApiUrl', (done) => {
		const fetch = wcApiService.fetchWpApiUrl('http://example.com');
		expect(fetch).toBeInstanceOf(Observable);
		fetch.subscribe((data) => {
			expect(data).toBe('http://example.com/wp-json/');
			done();
		});
	});

	it('getWpApiUrlFromHeadResponse', () => {
		expect(wcApiService.parseApiUrlFromHeaders(mockHeaders)).toBe('http://example.com/wp-json/');
	});

	it('fetchWcApiUrl', (done) => {
		const fetch = wcApiService.fetchWcApiUrl('http://example.com/wp-json/');
		expect(fetch).toBeInstanceOf(Observable);
		fetch.subscribe((data) => {
			expect(data).toHaveProperty('name', 'WooCommerce POS Development');
			expect(data).toHaveProperty('wc_api_url', 'http://example.com/wp-json/wc/v3/');
			expect(data).toHaveProperty('wc_api_auth_url', 'https://example.com/wc-auth/v1/authorize');
			done();
		});
	});
});
