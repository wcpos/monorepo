import { Observable, of } from 'rxjs';
import { testables } from './wc-auth';

const mockHeadResponse = {
	headers: {
		link: '<http://example.com/wp-json/>; rel="https://api.w.org/"',
		status: 200,
	},
	config: {
		url: 'http://example.com',
	},
};

const mockWpApiIndexResponse = {
	name: 'WooCommerce POS Development',
	description: '',
	url: 'http://example.com',
	home: 'https://example.com',
	gmt_offset: '0',
	timezone_string: '',
	namespaces: ['oembed/1.0', 'wc/blocks', 'wc/v1', 'wc/v2', 'wc/v3', 'wccom-site/v1', 'wp/v2'],
	authentication: {
		wcpos: {
			authorize: 'https://example.com/wc-auth/v1/authorize',
		},
	},
};

jest.mock('../lib/http', () => {
	return {
		head: (url) => {
			return new Promise((resolve, reject) => {
				process.nextTick(() => resolve(mockHeadResponse));
			});
		},
		get: (url) => {
			return new Promise((resolve, reject) => {
				process.nextTick(() => resolve(mockWpApiIndexResponse));
			});
		},
	};
});

describe('WooCommerce Auth Service', () => {
	it('fetchSiteHead', (done) => {
		const fetch = testables.fetchSiteHead('http://example.com');
		expect(fetch).toBeInstanceOf(Observable);
		fetch.subscribe((data) => {
			expect(data).toBe('http://example.com/wp-json/');
			done();
		});
	});

	it('getWpApiUrlFromHeadResponse', () => {
		expect(testables.getWpApiUrlFromHeadResponse(mockHeadResponse)).toBe(
			'http://example.com/wp-json/'
		);
	});

	it('fetchWpApiIndex', (done) => {
		const fetch = testables.fetchWpApiIndex('http://example.com/wp-json/');
		expect(fetch).toBeInstanceOf(Observable);
		fetch.subscribe((data) => {
			console.log(data);
			done();
		});
	});
});
