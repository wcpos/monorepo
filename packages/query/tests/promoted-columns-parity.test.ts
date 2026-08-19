import { promotedOrderColumns, promotedProductColumns } from '@wcpos/sync-core';
import { promotedVariationColumns } from '@wcpos/sync-engine';

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

	// Ruled 2026-08-19: promotedColumnsFor delegates to the sync-core projectors, so the
	// former divergences are pinned as SINGLE behaviors on both faces.
	it('preserves negative prices on both faces (no clamp — ruled)', () => {
		const payload = { price: '-1.25' };

		expect(promotedColumnsFor('products', payload).price).toBe(-1.25);
		expect(promotedProductColumns(payload).price).toBe(-1.25);
	});

	it('accepts bare-number taxonomy ids on both faces (ruled)', () => {
		const payload = { categories: [3], brands: [7] };

		expect(promotedColumnsFor('products', payload)).toMatchObject({
			categoryIds: [3],
			brandIds: [7],
		});
		expect(promotedProductColumns(payload)).toMatchObject({
			categoryIds: [3],
			brandIds: [7],
		});
	});

	it("treats a cleared stock quantity ('') as unmanaged (null), never 0", () => {
		expect(promotedProductColumns({ stock_quantity: '' }).stockQuantity).toBeNull();
		expect(promotedColumnsFor('products', { stock_quantity: '' }).stockQuantity).toBeNull();
	});

	it('still accepts Woo object taxonomy entries and drops garbage', () => {
		const payload = {
			categories: [{ id: 3 }, 'nope', true, [4], null, -2, { id: 0 }],
			brands: [],
		};

		expect(promotedProductColumns(payload)).toMatchObject({
			categoryIds: [3],
			brandIds: [],
		});
	});
});

// Unlike products/orders, the variation map face still carries its own write fns (the
// sync-engine projector isn't reachable from the map — it also owns parentRemoteId, which
// the map derives separately). This pin is the drift tripwire #1308 gave the other two
// collections: the four shared columns must agree on both faces.
describe('promoted variation columns parity', () => {
	it('matches the sync-engine projector for canonical Woo variation payloads', () => {
		const payload = {
			price: '12.345',
			stock_status: 'instock',
			stock_quantity: 3.6,
			attributes: [{ id: 1, name: 'Size', option: 'Large' }],
		};

		expect(promotedColumnsFor('variations', payload)).toMatchObject(
			promotedVariationColumns(payload)
		);
	});

	it("treats a cleared stock quantity ('') as unmanaged (null) on both faces, never 0", () => {
		expect(promotedVariationColumns({ stock_quantity: '' }).stockQuantity).toBeNull();
		expect(promotedColumnsFor('variations', { stock_quantity: '' }).stockQuantity).toBeNull();
	});
});

describe('promoted order columns parity', () => {
	it('matches for canonical Woo order payloads', () => {
		const payload = {
			number: '1234',
			date_created_gmt: '2026-08-19T10:00:00',
			status: 'pos-open',
			total: '99.50',
			customer_id: 42,
		};

		expect(promotedColumnsFor('orders', payload)).toEqual(promotedOrderColumns(payload));
	});
});
