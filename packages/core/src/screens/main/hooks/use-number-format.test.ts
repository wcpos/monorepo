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

describe('a negative reads with a true minus (U+2212), never a hyphen', () => {
	it.each([
		// [currency position, prefix, suffix, shown]
		['left', '£', '', '−£1.234,50'],
		['left_space', '£ ', '', '−£ 1.234,50'],
		['right', '', '£', '−1.234,50£'],
		['right_space', '', ' £', '−1.234,50 £'],
	])('%s: -1234.5 shows %s%s as %s', (_position, prefix, suffix, shown) => {
		const { result } = renderHook(() =>
			useNumberFormat({ fixedDecimalScale: true, prefix, suffix })
		);
		expect(result.current.format(-1234.5)).toBe(shown);
		expect(result.current.format(1234.5)).toBe(`${prefix}1.234,50${suffix}`);
	});

	it.each([-0.001, -0.004, -0])('%s formats to zero and shows no sign', (value) => {
		const { result } = renderHook(() => useNumberFormat({ fixedDecimalScale: true, prefix: '£' }));
		expect(result.current.format(value)).toBe('£0,00');
	});

	it('a negative that cuts to zero without a fixed scale shows no sign', () => {
		const { result } = renderHook(() => useNumberFormat({ decimalScale: 1 }));
		expect(result.current.format(-0.04)).toBe('0,0');
	});

	it('a negative quantity reads with a true minus', () => {
		const { result } = renderHook(() =>
			useNumberFormat({ fixedDecimalScale: false, decimalScale: 6 })
		);
		expect(result.current.format(-2)).toBe('−2');
		expect(result.current.format(-0.125)).toBe('−0,125');
		expect(result.current.format(2)).toBe('2');
	});
});
