/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { useNumberFormat } from './use-number-format';

jest.mock('../../../contexts/app-state', () => ({ useAppState: () => ({ store: {} }) }));
jest.mock('@wcpos/query', () => ({
	useDocField: (_store: unknown, select: (value: Record<string, unknown>) => unknown) =>
		select({
			price_decimal_sep: ',',
			price_thousand_sep: '.',
			price_num_decimals: 2,
			thousands_group_style: 'thousand',
		}),
}));

it("formats a number the store's way", () => {
	const { result } = renderHook(() => useNumberFormat({ fixedDecimalScale: true }));
	expect(result.current.format(1234.5)).toBe('1.234,50');
	expect(result.current.format(0)).toBe('0,00');
});

it('a price typed as twenty-two 1s reads as the number it is, never as 1,11', () => {
	const { result } = renderHook(() => useNumberFormat({ fixedDecimalScale: true }));
	expect(result.current.format(Number.parseFloat('1'.repeat(22)))).toBe(
		'1.111.111.111.111.111.100.000,00'
	);
});
