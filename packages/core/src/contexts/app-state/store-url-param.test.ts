import { withStoreParam } from './store-url-param';

describe('withStoreParam', () => {
	it('adds the store parameter', () => {
		expect(withStoreParam('', 12)).toBe('?store=12');
	});

	it('replaces an existing store parameter', () => {
		expect(withStoreParam('?store=4', 12)).toBe('?store=12');
	});

	it('preserves other parameters', () => {
		expect(withStoreParam('foo=bar&store=4&view=compact', 12)).toBe(
			'?foo=bar&store=12&view=compact'
		);
	});
});
