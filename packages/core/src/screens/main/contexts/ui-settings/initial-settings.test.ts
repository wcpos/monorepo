import initialSettings from './initial-settings.json';

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
