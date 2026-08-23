/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useOrderTotals } from './use-order-totals';

const localPatch = jest.fn();
const computed = {
	discount_tax: '0.000000',
	discount_total: '0.000000',
	shipping_tax: '0.000000',
	shipping_total: '0.000000',
	cart_tax: '6.713280',
	total_tax: '6.713280',
	total: '36.683280',
	tax_lines: [{ rate_id: 1, tax_total: '5.994000' }],
};

let couponLines: { code: string }[] = [];
const currentOrderRecord = {
	uuid: 'order-a',
	payload: { uuid: 'order-a', total: '0.00' },
	getLatest: () => currentOrderRecord,
};

jest.mock('./calculate-order-totals', () => ({
	calculateOrderTotals: () => ({ ...computed }),
}));
jest.mock('./use-cart-lines', () => ({
	useCartLines: () => ({
		line_items: [],
		fee_lines: [],
		shipping_lines: [],
		coupon_lines: couponLines,
	}),
}));
jest.mock('../../contexts/tax-rates', () => ({
	useTaxSettings: () => ({
		allRates: [],
		taxRoundAtSubtotal: false,
		priceNumDecimals: 2,
		pricesIncludeTax: false,
	}),
}));
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch }),
}));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord }),
}));
jest.mock('../contexts/order-money-divergence', () => ({
	useOrderMoneyDivergence: () => ({ divergence: null }),
}));

beforeEach(() => {
	localPatch.mockClear();
	couponLines = [];
	computed.total = '36.683280';
});

it('returns all computed money fields for display without writing them', () => {
	const { result } = renderHook(() => useOrderTotals());

	expect(result.current.discount_tax).toBe('0.000000');
	expect(result.current.discount_total).toBe('0.000000');
	expect(result.current.shipping_tax).toBe('0.000000');
	expect(result.current.shipping_total).toBe('0.000000');
	expect(result.current.cart_tax).toBe('6.713280');
	expect(result.current.total_tax).toBe('6.713280');
	expect(result.current.total).toBe('36.683280');
	expect(result.current.tax_lines).toEqual([{ rate_id: 1, tax_total: '5.994000' }]);
	expect(localPatch).not.toHaveBeenCalled();
});

it('keeps returning the previous totals during the existing coupon debounce', () => {
	jest.useFakeTimers();
	couponLines = [{ code: 'bonus' }];
	const { result, rerender } = renderHook(() => useOrderTotals());

	computed.total = '41.000000';
	rerender();
	expect(result.current.total).toBe('36.683280');

	act(() => {
		jest.advanceTimersByTime(50);
	});
	expect(result.current.total).toBe('41.000000');
	jest.useRealTimers();
});
