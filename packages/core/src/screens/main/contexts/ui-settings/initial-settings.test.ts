import initialSettings from './initial-settings.json';

describe('pos-products initial settings', () => {
	it('defaults the browse sort to the 1.9 catalog order — menu_order asc (#810)', () => {
		expect(initialSettings['pos-products'].sortBy).toBe('menu_order');
		expect(initialSettings['pos-products'].sortDirection).toBe('asc');
	});
});

describe('pos-cart initial settings', () => {
	it('includes an image column that is hidden by default', () => {
		expect(initialSettings['pos-cart'].columns).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: 'image',
					show: false,
				}),
			])
		);
	});
});
