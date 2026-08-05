import { promotedProductColumns } from '@wcpos/sync-core';

import { promotedColumnsFor } from '../src/engine-adapter/collection-map';

describe('promoted product columns parity', () => {
	it('matches for canonical Woo product payloads', () => {
		const payload = {
			name: 'Coffee',
			sku: 'COFFEE-1',
			barcode: '012345678905',
			price: '12.345',
			regular_price: '14.00',
			sale_price: '12.345',
			stock_status: 'instock',
			manage_stock: true,
			stock_quantity: 3.6,
			type: 'simple',
			categories: [{ id: 3, name: 'Coffee' }],
			brands: [{ id: 7, name: 'WCPOS' }],
			on_sale: true,
			featured: false,
		};
		const queryColumns = promotedColumnsFor('products', payload);

		expect(queryColumns).toEqual(promotedProductColumns(payload));
	});

	// The source-of-truth decision for these known divergences is pending.
	it('documents the negative-price clamp divergence', () => {
		const payload = { price: '-1.25' };

		expect(promotedColumnsFor('products', payload).price).toBe(0);
		expect(promotedProductColumns(payload).price).toBe(-1.25);
	});

	it('documents the bare-number taxonomy divergence', () => {
		const payload = { categories: [3], brands: [7] };

		expect(promotedColumnsFor('products', payload)).toMatchObject({
			categoryIds: [3],
			brandIds: [7],
		});
		expect(promotedProductColumns(payload)).toMatchObject({
			categoryIds: [],
			brandIds: [],
		});
	});
});
