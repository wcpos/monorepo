import {
	EngineAdapterSelectorError,
	translateSelector,
} from '../../src/engine-adapter/translate-selector';

const product = {
	id: 'product-1',
	wooProductId: 10,
	stockStatus: 'instock',
	type: 'simple',
	featured: true,
	onSale: false,
	categoryIds: [2, 7],
	brandIds: [4],
	price: 12.35,
	stockQuantity: 3,
	payload: {
		id: 10,
		name: 'Alpha',
		price: '12.345',
		categories: [{ id: 2 }, { id: 7 }],
		brands: [{ id: 4 }],
		tags: [{ id: 9, name: 'Sale' }],
		meta_data: [{ key: 'color', value: 'blue' }],
	},
};

describe('translateSelector', () => {
	it('puts only identifiers and promoted fields in the RxDB prefilter', () => {
		const translated = translateSelector('products', {
			id: { $in: [10, 11] },
			stock_status: 'instock',
			name: { $regex: '^Al' },
			meta_data: { $elemMatch: { key: 'color', value: 'blue' } },
		});

		expect(translated.prefilter).toEqual({
			wooProductId: { $in: [10, 11] },
			stockStatus: 'instock',
		});
		expect(translated.residual(product)).toBe(true);
		expect(
			translated.residual({
				...product,
				payload: { ...product.payload, name: 'Beta' },
			})
		).toBe(false);
	});

	it('translates category and brand object matches to numeric membership prefilters', () => {
		const translated = translateSelector('products', {
			categories: { $elemMatch: { id: 7 } },
			brands: { $elemMatch: { id: { $eq: 4 } } },
			tags: { $elemMatch: { id: 9 } },
		});

		expect(translated.prefilter).toEqual({
			categoryIds: { $in: [7] },
			brandIds: { $in: [4] },
		});
		expect(translated.residual(product)).toBe(true);
	});

	it('keeps type-changing promoted price comparisons in the residual', () => {
		const translated = translateSelector('products', { price: '12.345' });

		expect(translated.prefilter).toEqual({});
		expect(translated.residual(product)).toBe(true);
	});

	it('preserves logical operators without unsafe prefiltering', () => {
		const translated = translateSelector('orders', {
			$and: [
				{ status: { $ne: 'cancelled' } },
				{
					$or: [{ customer_id: 7 }, { created_via: 'checkout' }],
				},
			],
		});

		expect(translated.prefilter).toEqual({
			$and: [{ status: { $ne: 'cancelled' } }],
		});
		expect(
			translated.residual({
				id: 'order-1',
				status: 'processing',
				customerId: 2,
				payload: { created_via: 'checkout' },
			})
		).toBe(true);
	});

	it('evaluates normalized variation attributes including any-attribute semantics', () => {
		const variation = {
			id: 'variation-1',
			wooId: 20,
			attributes: [{ id: 1, name: 'Color', option: 'Red' }],
			payload: {
				attributes: [
					{ id: '1', name: 'Color', option: 'Red' },
					{ id: 2, name: 'Size', option: '' },
				],
			},
		};

		expect(
			translateSelector('variations', {
				attributes: { $elemMatch: { id: 1, name: 'Color', option: 'Red' } },
			}).residual(variation)
		).toBe(true);
		expect(
			translateSelector('variations', {
				attributes: {
					$not: { $elemMatch: { id: 2, name: 'Size' } },
				},
			}).residual(variation)
		).toBe(true);
		expect(
			translateSelector('variations', {
				attributes: {
					$allMatch: [
						{ name: 'Color', option: 'Red' },
						{ name: 'Size', option: 'Large' },
					],
				},
			}).residual(variation)
		).toBe(true);
	});

	it.each([
		[{ value: { $eq: 3 } }, 3, true],
		[{ value: { $ne: 3 } }, 4, true],
		[{ value: { $gt: 3, $lte: 5 } }, 5, true],
		[{ value: { $gte: 3, $lt: 5 } }, 3, true],
		[{ value: { $in: [2, 3] } }, 3, true],
		[{ value: { $nin: [2, 3] } }, 4, true],
		[{ value: { $exists: false } }, undefined, true],
		[{ value: { $regex: '^alp', $options: 'i' } }, 'Alpha', true],
	])('evaluates supported Mango operators %#', (selector, value, expected) => {
		const translated = translateSelector('products', selector);
		expect(translated.residual({ id: 'operator-doc', payload: { value } })).toBe(expected);
	});

	it('throws a named error for unknown operators before execution', () => {
		expect(() => translateSelector('products', { price: { $approximately: 10 } })).toThrow(
			EngineAdapterSelectorError
		);
		expect(() => translateSelector('products', { price: { $approximately: 10 } })).toThrow(
			'Unsupported Mango operator "$approximately"'
		);
	});

	it.each([
		['products', { uuid: 'product-1' }, product],
		['products', { id: { $in: [10] } }, product],
		['products', { stock_status: 'instock' }, product],
		['products', { featured: true }, product],
		['products', { on_sale: false }, product],
		['products', { categories: { $elemMatch: { id: 7 } } }, product],
		['products', { brands: { $elemMatch: { id: 4 } } }, product],
		['products', { tags: { $elemMatch: { id: 9 } } }, product],
		['products', { meta_data: { $elemMatch: { key: 'color', value: 'blue' } } }, product],
		['products', { name: 'Alpha' }, product],
		[
			'products',
			{ status: 'publish' },
			{ ...product, payload: { ...product.payload, status: 'publish' } },
		],
		[
			'products',
			{ category: 'synthetic' },
			{ ...product, payload: { ...product.payload, category: 'synthetic' } },
		],
		[
			'variations',
			{ id: { $in: [20] } },
			{ id: 'variation-1', wooId: 20, attributes: [], payload: {} },
		],
		[
			'variations',
			{ attributes: { $elemMatch: { id: 1, name: 'Color', option: 'Red' } } },
			{
				id: 'variation-1',
				attributes: [{ id: 1, name: 'Color', option: 'Red' }],
				payload: {},
			},
		],
		[
			'variations',
			{ name: 'Variation' },
			{ id: 'variation-1', attributes: [], payload: { name: 'Variation' } },
		],
		['orders', { status: 'processing' }, { id: 'order-1', status: 'processing', payload: {} }],
		['orders', { customer_id: 7 }, { id: 'order-1', customerId: 7, payload: {} }],
		[
			'orders',
			{ date_created_gmt: { $gte: '2026-01-01', $lte: '2026-12-31' } },
			{ id: 'order-1', dateCreatedGmt: '2026-07-01', payload: {} },
		],
		[
			'orders',
			{ meta_data: { $elemMatch: { key: '_pos_user', value: '5' } } },
			{
				id: 'order-1',
				payload: { meta_data: [{ key: '_pos_user', value: '5' }] },
			},
		],
		['orders', { created_via: 'wcpos' }, { id: 'order-1', payload: { created_via: 'wcpos' } }],
		[
			'customers',
			{ id: 7, role: { $in: ['cashier'] } },
			{ id: 'customer-1', wooCustomerId: 7, payload: { role: 'cashier' } },
		],
		[
			'coupons',
			{ status: 'publish', discount_type: 'percent' },
			{
				id: 'coupon-1',
				payload: { status: 'publish', discount_type: 'percent' },
			},
		],
		[
			'coupons',
			{ date_expires_gmt: { $gt: '2026-01-01', $lt: '2027-01-01' } },
			{ id: 'coupon-1', payload: { date_expires_gmt: '2026-08-01' } },
		],
	] as const)('matches the census selector %# for %s', (collection, selector, document) => {
		expect(translateSelector(collection, selector).residual(document)).toBe(true);
	});
});

describe('query-builder operators (codex round 2)', () => {
	it('evaluates $all on payload arrays', () => {
		const { residual } = translateSelector('products', { tag_ids: { $all: [1, 2] } } as any);
		expect(residual({ id: 'a', payload: { tag_ids: [1, 2, 3] } } as any)).toBe(true);
		expect(residual({ id: 'b', payload: { tag_ids: [1, 3] } } as any)).toBe(false);
	});

	it('keeps $all out of the RxDB prefilter', () => {
		const translated = translateSelector('variations', {
			attributes: { $all: [{ name: 'Color', option: 'Red' }] },
		} as any);

		expect(translated.prefilter).toEqual({});
		expect(
			translated.residual({
				id: 'variation-1',
				attributes: [{ name: 'Color', option: 'Red' }],
				payload: {},
			})
		).toBe(true);
	});

	it('evaluates $size on payload arrays', () => {
		const { residual } = translateSelector('products', { tag_ids: { $size: 2 } } as any);
		expect(residual({ id: 'a', payload: { tag_ids: [1, 2] } } as any)).toBe(true);
		expect(residual({ id: 'b', payload: { tag_ids: [1] } } as any)).toBe(false);
	});

	it('evaluates $mod on numeric payload fields', () => {
		const { residual } = translateSelector('products', { menu_order: { $mod: [2, 0] } } as any);
		expect(residual({ id: 'a', payload: { menu_order: 4 } } as any)).toBe(true);
		expect(residual({ id: 'b', payload: { menu_order: 5 } } as any)).toBe(false);
	});

	it('evaluates root $nor', () => {
		const { residual } = translateSelector('products', {
			$nor: [{ status: 'draft' }, { status: 'pending' }],
		} as any);
		expect(residual({ id: 'a', payload: { status: 'publish' } } as any)).toBe(true);
		expect(residual({ id: 'b', payload: { status: 'draft' } } as any)).toBe(false);
	});
});
