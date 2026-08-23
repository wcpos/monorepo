/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useCartLines } from './use-cart-lines';

/**
 * useCartLines is mounted THREE times on the cart surface — cart/table.tsx,
 * cart/totals.tsx and use-order-totals.ts. That is only safe because it is a pure
 * selector.
 *
 * Before #1472 it also owned the settlement, so each of those mounts carried its own
 * single-flight ref and its own re-push latch. While settlement ran only for couponed
 * carts that was survivable; once settle became the writer for every cart change it
 * would have meant three concurrent writes per edit. The write moved to
 * useCartSettlement, which OpenOrders mounts once.
 *
 * This suite pins the property that makes the three mounts safe: the selector never
 * writes. If settlement is ever moved back in here, this fails.
 */
const localPatch = jest.fn();

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch }),
}));

let payload: Record<string, unknown> = {};

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: { uuid: 'order-1', payload } }),
}));

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: { payload: Record<string, unknown> }, select: (r: unknown) => unknown) =>
		select(record),
}));

beforeEach(() => {
	localPatch.mockClear();
	payload = {
		line_items: [{ product_id: 1, total: '10.00' }],
		fee_lines: [],
		shipping_lines: [],
		coupon_lines: [],
	};
});

describe('useCartLines', () => {
	it('never writes, however many times it is mounted', async () => {
		renderHook(() => useCartLines());
		renderHook(() => useCartLines());
		const { rerender } = renderHook(() => useCartLines());

		await act(async () => {
			payload = { ...payload, line_items: [{ product_id: 2, total: '25.00' }] };
			rerender();
		});

		expect(localPatch).not.toHaveBeenCalled();
	});

	it('filters out removed lines', () => {
		payload = {
			line_items: [{ product_id: 1 }, { product_id: null }],
			fee_lines: [{ name: 'Handling' }, { name: null }],
			shipping_lines: [{ method_id: 'flat_rate' }, { method_id: null }],
			coupon_lines: [{ code: 'save10' }, { code: null }],
		};

		const { result } = renderHook(() => useCartLines());

		expect(result.current.line_items).toEqual([{ product_id: 1 }]);
		expect(result.current.fee_lines).toEqual([{ name: 'Handling' }]);
		expect(result.current.shipping_lines).toEqual([{ method_id: 'flat_rate' }]);
		expect(result.current.coupon_lines).toEqual([{ code: 'save10' }]);
	});
});
