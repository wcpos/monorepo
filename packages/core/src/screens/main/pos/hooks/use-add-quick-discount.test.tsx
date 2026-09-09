/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { useAddQuickDiscount } from './use-add-quick-discount';

const localPatch = jest.fn();
const recalculate = jest.fn();
const mockInfo = jest.fn();
const mockFailure = jest.fn();
const lineItems = [{ product_id: 1, total: '100', subtotal: '100', quantity: 1 }];
let couponLines: { code: string }[] = [];
const currentOrderRecord = {
	uuid: 'order',
	get payload() {
		return { line_items: lineItems, coupon_lines: couponLines };
	},
	getLatest: jest.fn(),
};
jest.mock('uuid', () => ({ v4: () => 'discount-uuid' }));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ with: () => ({ info: mockInfo }) }),
	getErrorMessage: (error: Error) => error.message,
}));
jest.mock('./cart-failure', () => ({
	reportCartFailure: (...args: unknown[]) => mockFailure(...args),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch }),
}));
jest.mock('./use-recalculate-coupons', () => ({ useRecalculateCoupons: () => ({ recalculate }) }));
jest.mock('../contexts/current-order', () => ({ useCurrentOrder: () => ({ currentOrderRecord }) }));

beforeEach(() => {
	jest.clearAllMocks();
	couponLines = [];
	currentOrderRecord.getLatest.mockImplementation(() => ({ payload: currentOrderRecord.payload }));
	localPatch.mockResolvedValue({ uuid: 'order' });
	recalculate.mockImplementation(async (_lines, coupons) => ({
		lineItems: [{ ...lineItems[0], total: '90' }],
		couponLines: coupons,
	}));
});
it.each(['percent', 'fixed_cart'] as const)(
	'persists %s intent and UUID with both recalculated arrays',
	async (discount_type) => {
		const { result } = renderHook(() => useAddQuickDiscount());
		await expect(result.current.addQuickDiscount({ discount_type, amount: '10' })).resolves.toEqual(
			{ success: true }
		);
		const line = {
			code: 'pos-discount',
			discount: '0',
			discount_tax: '0',
			meta_data: [
				{ key: '_wcpos_quick_discount', value: { discount_type, amount: '10' } },
				{ key: '_woocommerce_pos_uuid', value: 'discount-uuid' },
			],
		};
		expect(recalculate).toHaveBeenCalledWith(lineItems, [line]);
		expect(localPatch).toHaveBeenCalledWith({
			document: expect.anything(),
			data: {
				coupon_lines: [line],
				line_items: [{ ...lineItems[0], total: '90' }],
			},
		});
		expect(mockInfo).toHaveBeenCalledWith(expect.any(String), {
			context: {
				event: 'quick_discount.added',
				discountType: discount_type,
				amount: '10',
				code: 'pos-discount',
			},
		});
	}
);
it('appends a second discount without replacing the first', async () => {
	couponLines = [{ code: 'pos-discount' }];
	const { result } = renderHook(() => useAddQuickDiscount());
	await result.current.addQuickDiscount({ discount_type: 'percent', amount: '10' });
	expect(recalculate.mock.calls[0][1].map((line: { code: string }) => line.code)).toEqual([
		'pos-discount',
		'pos-discount-2',
	]);
});
it('rejects a cart changed before recalculation', async () => {
	currentOrderRecord.getLatest.mockReturnValueOnce({ payload: currentOrderRecord.payload });
	couponLines = [{ code: 'changed' }];
	const { result } = renderHook(() => useAddQuickDiscount());
	await expect(
		result.current.addQuickDiscount({ discount_type: 'percent', amount: '10' })
	).resolves.toEqual({ success: false, error: 'pos_cart.cart_changed' });
	expect(recalculate).not.toHaveBeenCalled();
	expect(localPatch).not.toHaveBeenCalled();
});
it('rejects a cart changed during recalculation without patching', async () => {
	recalculate.mockImplementationOnce(async () => {
		couponLines = [{ code: 'changed' }];
		return { lineItems, couponLines: [] };
	});
	const { result } = renderHook(() => useAddQuickDiscount());
	await expect(
		result.current.addQuickDiscount({ discount_type: 'percent', amount: '10' })
	).resolves.toEqual({ success: false, error: 'pos_cart.cart_changed' });
	expect(localPatch).not.toHaveBeenCalled();
});
it('reports failures and does not log success for a rejected write', async () => {
	const { result } = renderHook(() => useAddQuickDiscount());
	localPatch.mockResolvedValueOnce(undefined);
	await expect(
		result.current.addQuickDiscount({ discount_type: 'fixed_cart', amount: '10' })
	).resolves.toEqual({ success: false, error: 'pos_cart.coupon_apply_failed' });
	expect(mockInfo).not.toHaveBeenCalled();
	recalculate.mockRejectedValueOnce(new Error('failed'));
	await expect(
		result.current.addQuickDiscount({ discount_type: 'fixed_cart', amount: '10' })
	).resolves.toEqual({ success: false, error: 'failed' });
	expect(mockFailure).toHaveBeenCalledWith(
		expect.anything(),
		'Local mutation failed',
		expect.objectContaining({ error: expect.any(Error) })
	);
});
