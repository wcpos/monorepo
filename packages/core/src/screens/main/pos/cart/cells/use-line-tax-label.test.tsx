/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { useLineTaxLabel } from './use-line-tax-label';

let mockDisplay = 'incl';
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, select: (store: unknown) => unknown) =>
		select({ tax_display_cart: mockDisplay }),
}));
jest.mock('../../../../../contexts/app-state', () => ({ useAppState: () => ({ store: {} }) }));
jest.mock('../../../hooks/use-current-order-currency-format', () => ({
	useCurrentOrderCurrencyFormat: () => ({ format: (value: number) => '$' + value.toFixed(2) }),
}));
jest.mock('../../../../../contexts/translations', () => {
	const strings = jest.requireActual('../../../../../contexts/translations/locales/en/core.json');
	const t = (key: string, params?: { amount?: string }) =>
		(strings[key] ?? key).replace('{amount}', params?.amount ?? '');
	return { useT: () => t };
});

beforeEach(() => {
	mockDisplay = 'incl';
});

// Revert: the cell prints `${taxDisplayCart} ${amount} tax`, so S26 reads "incl $4.01 tax".
it('says incl. and the amount when the cart shows prices with tax', () => {
	const { result } = renderHook(() => useLineTaxLabel());
	expect(result.current(4.01)).toBe('incl. $4.01 tax');
});

it('says excl. when the cart shows prices without tax', () => {
	mockDisplay = 'excl';
	const { result } = renderHook(() => useLineTaxLabel());
	expect(result.current(4.01)).toBe('excl. $4.01 tax');
});
