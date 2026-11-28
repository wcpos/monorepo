/**
 * @jest-environment jsdom
 */
import { of } from 'rxjs';
import { renderHook } from '@testing-library/react';

import { useQueryRuntime } from '@wcpos/query';
import { settleCart } from '@wcpos/order-math';

import { config } from '../../../../../jest/cart-write';
import { readCouponContext, useCouponContext } from './use-coupon-context';

const engine = { active: jest.fn() };

jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useQueryRuntime: () => ({ engine }),
	observeCatalogByWooIds: () =>
		of({
			available: true,
			products: [{ remoteId: '82', payload: { tax_status: 'none' } }],
			variations: [],
		}),
}));

const engineRecord = (remoteId: string, payload: Record<string, unknown>) => ({
	uuid: `record-${remoteId}`,
	remoteId,
	remoteKey: String(remoteId ?? ''),
	payload,
});

beforeEach(() => {
	engine.active.mockReturnValue({
		database: {
			collections: {
				coupons: {
					find: () => ({
						exec: async () => [
							engineRecord('501', {
								code: 'SummerSale',
								discount_type: 'percent',
								amount: '10',
							}),
						],
					}),
				},
				products: {
					find: () => ({
						exec: async () => [engineRecord('82', { id: 82, categories: [{ id: 17 }] })],
					}),
				},
				categories: {
					find: () => ({
						exec: async () => [
							engineRecord('16', { id: 16, parent: 0 }),
							engineRecord('17', { id: 17, parent: 16 }),
						],
					}),
				},
			},
		},
	});
});

it('builds lowercase coupons, raw product categories, and category parents from engine residents', async () => {
	const { result } = renderHook(() => useCouponContext());

	const context = await result.current.getCouponContext([{ product_id: 82 }]);

	expect([...context.coupons.keys()]).toEqual(['summersale']);
	expect(context.coupons.get('summersale')).toEqual(
		expect.objectContaining({
			code: 'SummerSale',
			discount_type: 'percent',
			amount: '10',
		})
	);
	// Settle owns ancestor enrichment: category 16 must not be present here.
	expect(context.productCategories.get(82)).toEqual([{ id: 17 }]);
	expect(context.categoryParents).toEqual(
		new Map([
			[16, 0],
			[17, 16],
		])
	);
});

it.each(['missing', 'mixed', 'collision'])('resolves virtual context: %s', async (mode) => {
	const records =
		mode === 'missing'
			? []
			: [
					engineRecord('501', {
						code: mode === 'collision' ? 'pos-discount' : 'real',
						discount_type: 'fixed_cart',
						amount: '99',
					}),
				];
	engine.active().database.collections.coupons.find = () => ({ exec: async () => records });
	const { result } = renderHook(() => useCouponContext());
	const context = await result.current.getCouponContext(
		[],
		[
			{
				code: 'pos-discount',
				meta_data: [
					{ key: '_wcpos_quick_discount', value: { discount_type: 'percent', amount: '10' } },
				],
			},
		]
	);
	expect(context.coupons.get('pos-discount')).toEqual(
		expect.objectContaining({
			discount_type: 'percent',
			amount: '10',
			individual_use: false,
		})
	);
	expect(context.coupons.size).toBe(mode === 'mixed' ? 2 : 1);
	if (mode === 'mixed') expect(context.coupons.get('real')?.amount).toBe('99');
});

it.each([0, null])(
	'readCouponContext issues no product query for misc-only or tombstoned lines: %s',
	async (product_id) => {
		const productFind = jest.fn(() => {
			throw new Error('unexpected product query');
		});
		engine.active().database.collections.products.find = productFind;
		const { result } = renderHook(() => useQueryRuntime());
		const context = await readCouponContext(result.current, {
			lineItems: [{ product_id }],
			couponLines: [],
		});
		expect(context.productCategories.size).toBe(0);
		expect(productFind).not.toHaveBeenCalled();
	}
);

it('provides catalog tax status on the coupon context', async () => {
	const { result } = renderHook(() => useCouponContext());
	const context = await result.current.getCouponContext([{ product_id: 82 }]);
	expect(context.taxStatusFor?.({ product_id: 82 })).toBe('none');
});

describe('settling a store-calculated line', () => {
	const cart = {
		line_items: [{ product_id: 82, quantity: 1, subtotal: '18', total: '18' }],
		coupon_lines: [{ code: 'credit', discount: '5' }],
	};
	const readContext = (storeCalculatedTypes?: ReadonlySet<string>) => {
		engine.active().database.collections.coupons.find = () => ({
			exec: async () => [
				engineRecord('601', { code: 'Credit', discount_type: 'acme_credit', amount: '20' }),
			],
		});
		const { result } = renderHook(() => useQueryRuntime());
		return readCouponContext(result.current, {
			lineItems: cart.line_items,
			couponLines: cart.coupon_lines,
			storeCalculatedTypes,
		});
	};

	it('settles a cart carrying a declared store-calculated line at 0', async () => {
		const coupons = await readContext(new Set(['acme_credit']));
		expect(coupons.storeCalculated.get('credit')).toBe('acme_credit');
		expect(coupons.unsupportedTypes.has('credit')).toBe(false);
		expect(settleCart(cart, config, { coupons })).toMatchObject({
			ok: true,
			patch: { coupon_lines: [{ code: 'credit', discount: '0' }] },
		});
	});

	it('without a declaration a store-calculated line is still missing_coupon', async () => {
		const coupons = await readContext();
		expect(settleCart(cart, config, { coupons })).toMatchObject({
			ok: false,
			error: { code: 'missing_coupon', missingCodes: ['credit'] },
		});
	});
});

it('keeps a type the POS cannot apply out of coupons and names it in unsupportedTypes', async () => {
	engine.active().database.collections.coupons.find = () => ({
		exec: async () => [
			engineRecord('601', { code: 'percent10', discount_type: 'percent', amount: '10' }),
			engineRecord('602', { code: 'credit20', discount_type: 'pi_store_credit', amount: '20' }),
		],
	});
	const { result } = renderHook(() => useCouponContext());
	const context = await result.current.getCouponContext([]);
	expect([...context.coupons.keys()]).toEqual(['percent10']);
	expect(context.unsupportedTypes).toEqual(new Map([['credit20', 'pi_store_credit']]));
});

it('puts a record with an empty or missing discount_type in neither map', async () => {
	engine.active().database.collections.coupons.find = () => ({
		exec: async () => [
			engineRecord('603', { code: 'blank', discount_type: '', amount: '5' }),
			engineRecord('604', { code: 'untyped', amount: '5' }),
		],
	});
	const { result } = renderHook(() => useCouponContext());
	const context = await result.current.getCouponContext([]);
	expect(context.coupons.size).toBe(0);
	expect(context.unsupportedTypes).toEqual(new Map());
});
