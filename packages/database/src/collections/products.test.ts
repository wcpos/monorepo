import { storeCollections } from './index';
import { sanitizeProductData } from './products';
import { productsLiteral } from './schemas/products';

describe('sanitizeProductData', () => {
	it('normalizes stale product REST payloads for schema migration', () => {
		const sanitized = sanitizeProductData({
			uuid: 'product-uuid',
			id: '1',
			name: 'Red Shirt',
			price: '9.99',
			attributes: [
				{
					id: '1',
					name: 'Color',
					options: ['Red'],
					position: '0',
				},
			],
			meta_data: [
				{ id: '10', key: '_alg_wc_cog_cost_archive', value: { stale: true } },
				{ id: '11', key: '_pos_visible', value: { enabled: true } },
			],
			_links: { self: [{ href: 'https://example.test/wp-json/wc/v3/products/1' }] },
			unexpected: 'drop me',
		});

		expect(sanitized).toMatchObject({
			uuid: 'product-uuid',
			id: 1,
			name: 'Red Shirt',
			price: '9.99',
			attributes: [
				{
					id: 1,
					name: 'Color',
					options: ['Red'],
					position: 0,
					visible: false,
					variation: false,
				},
			],
			meta_data: [{ id: 11, key: '_pos_visible', value: '{"enabled":true}' }],
			links: { self: [{ href: 'https://example.test/wp-json/wc/v3/products/1' }] },
		});
		expect(sanitized).not.toHaveProperty('_links');
		expect(sanitized).not.toHaveProperty('unexpected');
	});

	it('preserves an existing uuid when meta_data has no uuid entry', () => {
		expect(
			sanitizeProductData({
				uuid: 'existing-product-uuid',
				meta_data: [{ id: 1, key: '_pos_note', value: 'keep' }],
			})
		).toMatchObject({ uuid: 'existing-product-uuid' });
	});

	it('falls back to the WooCommerce product id if a legacy row has no uuid', () => {
		expect(sanitizeProductData({ id: 123, name: 'Legacy Product' })).toMatchObject({
			uuid: '123',
			id: 123,
		});
	});
});

describe('products migration strategy', () => {
	it('bumps products to schema version 6', () => {
		expect(productsLiteral.version).toBe(6);
	});

	it('sanitizes v5 product documents during v6 migration', () => {
		const migrated = storeCollections.products.migrationStrategies?.[6]?.({
			uuid: 'product-uuid',
			id: '1',
			price: '9.99',
			meta_data: [{ id: '11', key: '_pos_visible', value: { enabled: true } }],
			_links: { self: [{ href: 'https://example.test/product/1' }] },
		} as any);

		expect(migrated).toMatchObject({
			uuid: 'product-uuid',
			id: 1,
			meta_data: [{ id: 11, key: '_pos_visible', value: '{"enabled":true}' }],
			links: { self: [{ href: 'https://example.test/product/1' }] },
		});
		expect(migrated).not.toHaveProperty('_links');
	});
});
