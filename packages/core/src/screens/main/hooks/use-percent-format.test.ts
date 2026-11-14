/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { roundPercent } from './round-percent';
import { usePercentFormat } from './use-percent-format';

let mockDecimalSeparator = '.';
jest.mock('../../../contexts/app-state', () => ({ useAppState: () => ({ store: {} }) }));
jest.mock('@wcpos/query', () => ({
	useDocField: (_store: unknown, select: (value: Record<string, unknown>) => unknown) =>
		select({
			price_decimal_sep: mockDecimalSeparator,
			price_thousand_sep: ',',
			price_num_decimals: 2,
			thousands_group_style: 'thousand',
		}),
}));

beforeEach(() => {
	mockDecimalSeparator = '.';
});

it('trims trailing zeros and keeps odd decimals, past the price decimals', () => {
	const { result } = renderHook(() => usePercentFormat());
	expect(result.current('20.0000')).toBe('20%');
	expect(result.current('1.1250')).toBe('1.125%');
	expect(result.current(4.72500000001)).toBe('4.725%');
	expect(result.current('0.0000')).toBe('0%');
});

it("uses the store's decimal separator", () => {
	mockDecimalSeparator = ',';
	const { result } = renderHook(() => usePercentFormat());
	expect(result.current('1.1250')).toBe('1,125%');
});

it('reads a missing or unparseable rate as 0%', () => {
	const { result } = renderHook(() => usePercentFormat());
	expect(result.current('')).toBe('0%');
});

it('rounds to the four places WooCommerce stores', () => {
	expect(roundPercent(22.400000000000002)).toBe(22.4);
});
