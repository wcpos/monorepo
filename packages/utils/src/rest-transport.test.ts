import {
	deriveSyntheticPathRoot,
	isRestRouteBase,
	resolveRestTransport,
	toRestRouteUrl,
} from './rest-transport';

describe('REST transport', () => {
	it('detects a rest_route base', () => {
		expect(isRestRouteBase('https://shop.test/?rest_route=/')).toBe(true);
		expect(isRestRouteBase('https://shop.test/wp-json/')).toBe(false);
	});

	it.each([
		['https://shop.test/?rest_route=/', 'https://shop.test/wp-json/'],
		['https://shop.test/blog/?rest_route=/', 'https://shop.test/blog/wp-json/'],
		['https://shop.test/blog/index.php?rest_route=/', 'https://shop.test/blog/wp-json/'],
		['https://shop.test/blog/wp-json/', 'https://shop.test/blog/wp-json/'],
	])('derives the synthetic path root for %s', (input, expected) => {
		expect(deriveSyntheticPathRoot(input)).toBe(expected);
	});

	it.each([
		[
			'https://shop.test/wp-json/wcpos/v2/products',
			'https://shop.test/wp-json/',
			'https://shop.test/?rest_route=/wcpos/v2/products',
		],
		[
			'https://shop.test/blog/wp-json/wcpos/v2/products?page=2&search=red%20shirt',
			'https://shop.test/blog/wp-json/',
			'https://shop.test/blog/?rest_route=/wcpos/v2/products&page=2&search=red%20shirt',
		],
		[
			'https://shop.test/blog/custom-rest/wcpos/v2/products',
			'https://shop.test/blog/custom-rest/',
			'https://shop.test/blog/?rest_route=/wcpos/v2/products',
		],
	])('rewrites %s under %s', (url, root, expected) => {
		expect(toRestRouteUrl(url, root)).toBe(expected);
	});

	it('is idempotent and leaves URLs outside the root unchanged', () => {
		const queryUrl = 'https://shop.test/?rest_route=/wcpos/v2/products&page=2';
		expect(toRestRouteUrl(queryUrl, 'https://shop.test/wp-json/')).toBe(queryUrl);
		const outsideUrl = 'https://other.test/wp-json/wcpos/v2/products';
		expect(toRestRouteUrl(outsideUrl, 'https://shop.test/wp-json/')).toBe(outsideUrl);
	});

	it.each([
		[false, 'https://shop.test/wp-json/', 'path'],
		[true, 'https://shop.test/wp-json/', 'query'],
		[false, 'https://shop.test/?rest_route=/', 'query'],
		[true, 'https://shop.test/?rest_route=/', 'query'],
	] as const)('resolves flag %s and base %s to %s', (useRestRouteParam, wpApiUrl, expected) => {
		expect(
			resolveRestTransport({
				wp_api_url: wpApiUrl,
				use_rest_route_param: useRestRouteParam,
			})
		).toBe(expected);
	});
});
