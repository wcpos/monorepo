/** @jest-environment jsdom */
import * as React from 'react';

import { render, renderHook } from '@testing-library/react';

import { CheckoutTitle, useAmountToPay } from './title';

jest.mock('@wcpos/query', () => ({
	useRecordField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (n: number) => `$${Number(n).toFixed(2)}` }),
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<span data-testid={testID}>{children}</span>
	),
}));

const en = jest.requireActual('../../../../../contexts/translations/locales/en/core.json');
const makeOrder = () =>
	({
		payload: { currency_symbol: '$', total: '45.00', refunds: [{ total: -5 }] },
	}) as never;

it('useAmountToPay formats the net payment total, refunds deducted', () => {
	const { result } = renderHook(() => useAmountToPay(makeOrder()));
	expect(result.current).toContain('40');
	expect(result.current).toBe('$40.00');
});

it('CheckoutTitle still reads "Amount to Pay: $40.00"', () => {
	const view = render(<CheckoutTitle order={makeOrder()} />);
	expect(view.getByTestId('checkout-amount-to-pay').textContent).toBe(
		`${en['pos_checkout.amount_to_pay']}: $40.00`
	);
});
