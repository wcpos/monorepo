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

jest.mock('../lib/http', () => {
	return {
		head: (url) => {
			return new Promise((resolve, reject) => {
				process.nextTick(() => resolve(mockHeadResponse));
			});
		},
	};
});

describe('WooCommerce Auth Service', () => {
	it('fetchSiteHead', (done) => {
		const fetch = testables.fetchSiteHead('http://example.com');
		expect(fetch).toBeInstanceOf(Observable);
		fetch.subscribe((data) => {
			console.log(data);
			done();
		});
	});

	it('getWpApiUrlFromHeadResponse', () => {
		expect(testables.getWpApiUrlFromHeadResponse(mockHeadResponse)).toBe(
			'http://example.com/wp-json/'
		);
	});
});
