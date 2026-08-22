/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { useRemoveCoupon } from './use-remove-coupon';

const localPatch = jest.fn();
const recalculate = jest.fn();
const mockLoggerInfo = jest.fn();

jest.mock('@wcpos/utils/logger', () => {
	const logger = {
		get info() {
			return mockLoggerInfo;
		},
		with: () => logger,
	};
	return { getLogger: () => logger };
});

jest.mock('../../../../contexts/translations', () => ({
	useT: () =>
		jest
			.requireActual<typeof import('../../../../../jest/translate')>(
				'../../../../../jest/translate'
			)
			.createTestT(),
}));

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch }),
}));

jest.mock('./use-recalculate-coupons', () => ({
	useRecalculateCoupons: () => ({ recalculate }),
}));

type CouponLine = {
	id?: number;
	code: string | null;
	discount: string;
	discount_tax: string;
	meta_data: unknown[];
};

const lineItems = [{ product_id: 82, quantity: 1, subtotal: '18', total: '18' }];
let orderSnapshot: {
	uuid: string;
	id: number;
	number: string;
	line_items: typeof lineItems;
	coupon_lines: CouponLine[];
};

const currentOrderRecord = {
	uuid: 'order-uuid',
	get payload() {
		return orderSnapshot;
	},
	getLatest: () => currentOrderRecord,
};

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord }),
}));

const couponLine = (code: string, id?: number): CouponLine => ({
	...(id === undefined ? {} : { id }),
	code,
	discount: '1.80',
	discount_tax: '0',
	meta_data: [],
});

describe('useRemoveCoupon', () => {
	beforeEach(() => {
		localPatch.mockReset();
		recalculate.mockReset();
		mockLoggerInfo.mockReset();
		orderSnapshot = {
			uuid: 'order-uuid',
			id: 99,
			number: '99',
			line_items: lineItems,
			coupon_lines: [couponLine('save10')],
		};
	});

	it('matches coupon codes case-insensitively after trimming the requested code', async () => {
		recalculate.mockResolvedValue({ couponLines: [], lineItems });
		localPatch.mockResolvedValue({ uuid: 'order-uuid' });
		const { result } = renderHook(() => useRemoveCoupon());

		await result.current.removeCoupon('  SAVE10 ');

		expect(recalculate).toHaveBeenCalledTimes(1);
		expect(localPatch).toHaveBeenCalledTimes(1);
	});

	it('keeps a synced coupon as a code-null tombstone for recalculation', async () => {
		orderSnapshot.coupon_lines = [couponLine('save10', 12), couponLine('other', 13)];
		recalculate.mockResolvedValue({ couponLines: [], lineItems });
		localPatch.mockResolvedValue({ uuid: 'order-uuid' });
		const { result } = renderHook(() => useRemoveCoupon());

		await result.current.removeCoupon('save10');

		expect(recalculate).toHaveBeenCalledWith(lineItems, [
			{ id: 12, code: null, discount: '1.80', discount_tax: '0', meta_data: [] },
			{ id: 13, code: 'other', discount: '1.80', discount_tax: '0', meta_data: [] },
		]);
	});

	it('drops a local-only coupon from the array before recalculation', async () => {
		orderSnapshot.coupon_lines = [couponLine('save10'), couponLine('other', 13)];
		recalculate.mockResolvedValue({ couponLines: [], lineItems });
		localPatch.mockResolvedValue({ uuid: 'order-uuid' });
		const { result } = renderHook(() => useRemoveCoupon());

		await result.current.removeCoupon('save10');

		expect(recalculate).toHaveBeenCalledWith(lineItems, [
			{ id: 13, code: 'other', discount: '1.80', discount_tax: '0', meta_data: [] },
		]);
	});

	it('skips recalculation and the write when no coupon code matches', async () => {
		recalculate.mockResolvedValue({ couponLines: [], lineItems });
		localPatch.mockResolvedValue({ uuid: 'order-uuid' });
		const { result } = renderHook(() => useRemoveCoupon());

		await result.current.removeCoupon('missing');

		expect(recalculate).not.toHaveBeenCalled();
		expect(localPatch).not.toHaveBeenCalled();
	});

	it('skips the write when recalculation returns no result', async () => {
		recalculate.mockResolvedValue(undefined);
		const { result } = renderHook(() => useRemoveCoupon());

		await result.current.removeCoupon('save10');

		expect(localPatch).not.toHaveBeenCalled();
	});

	it('does not log a success toast when the local write returns no result', async () => {
		recalculate.mockResolvedValue({ couponLines: [], lineItems });
		localPatch.mockResolvedValue(undefined);
		const { result } = renderHook(() => useRemoveCoupon());

		await result.current.removeCoupon('save10');

		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(getLogger([]).info).not.toHaveBeenCalled();
	});

	it('writes recalculated coupon and line items before logging the success toast', async () => {
		const recalculatedCouponLines = [couponLine('other', 13)];
		const recalculatedLineItems = [{ ...lineItems[0], total: '16.20' }];
		recalculate.mockResolvedValue({
			couponLines: recalculatedCouponLines,
			lineItems: recalculatedLineItems,
		});
		localPatch.mockResolvedValue({ uuid: 'order-uuid' });
		const { result } = renderHook(() => useRemoveCoupon());

		await result.current.removeCoupon('save10');

		expect(localPatch).toHaveBeenCalledWith({
			document: currentOrderRecord,
			data: {
				coupon_lines: recalculatedCouponLines,
				line_items: recalculatedLineItems,
			},
		});
		expect(getLogger([]).info).toHaveBeenCalledWith('Coupon removed', {
			showToast: true,
			context: { couponCode: 'save10' },
		});
	});
});
