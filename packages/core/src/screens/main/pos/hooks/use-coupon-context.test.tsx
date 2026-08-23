/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { useCouponContext } from './use-coupon-context';

const engine = { active: jest.fn() };

jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useQueryRuntime: () => ({ engine }),
}));

const engineRecord = (remoteId: string, payload: Record<string, unknown>) => ({
	uuid: `record-${remoteId}`,
	remoteId,
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
