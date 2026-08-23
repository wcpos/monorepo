/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Totals } from './totals';

/**
 * The cart's hidden money markers (#1507).
 *
 * Since the POS stopped pushing the order aggregate — WooCommerce authors it,
 * and the wc/v3 schema discards what a client sends — the push body is no
 * longer a witness to what the till computed. These markers are the E2E's
 * client-side referent for every aggregate assertion, so what they carry is a
 * contract: the RAW persisted value, and an empty string (never a fabricated
 * `0.00`) when the order has not settled one. A spec must be able to tell "no
 * total yet" from "a total of zero".
 */
let orderPayload: Record<string, unknown> = {};
let couponLines: { code?: string; discount?: string; discount_tax?: string }[] = [];

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (order: unknown) => unknown) => select(record),
}));

jest.mock('@wcpos/components/text', () => {
	const { Text } = jest.requireActual('react-native');
	return { Text };
});
jest.mock('@wcpos/components/hstack', () => {
	const { View } = jest.requireActual('react-native');
	return { HStack: View };
});
jest.mock('@wcpos/components/vstack', () => {
	const { View } = jest.requireActual('react-native');
	return { VStack: View };
});
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/button', () => {
	const { Text, View } = jest.requireActual('react-native');
	return { ButtonPill: View, ButtonText: Text };
});

jest.mock('./totals/customer-note', () => ({ CustomerNote: () => null }));
jest.mock('./totals/taxes', () => ({ Taxes: () => null }));

jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../hooks/use-current-order-currency-format', () => ({
	useCurrentOrderCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));
jest.mock('../../hooks/use-tax-incl-or-excl', () => ({
	useTaxInclOrExcl: () => ({ inclOrExcl: 'excl' }),
}));
jest.mock('../hooks/use-order-totals', () => ({
	useOrderTotals: () => ({
		subtotal: '29.97',
		subtotal_tax: '0',
		fee_total: '0',
		fee_tax: '0',
		tax_lines: [],
		total_tax: '0',
		shipping_tax: '0',
		shipping_total: '0',
	}),
}));
jest.mock('../hooks/use-cart-lines', () => ({
	useCartLines: () => ({ coupon_lines: couponLines }),
}));
jest.mock('../hooks/use-remove-coupon', () => ({
	useRemoveCoupon: () => ({ removeCoupon: jest.fn() }),
}));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: { payload: orderPayload } }),
}));

const markers = () => ({
	total: screen.getByTestId('cart-order-total').textContent,
	discountTotal: screen.getByTestId('cart-discount-total').textContent,
});

describe('the cart money markers', () => {
	beforeEach(() => {
		orderPayload = {};
		couponLines = [];
	});

	it('carry the persisted aggregate verbatim, at full stored precision', () => {
		orderPayload = { total: '36.680000', discount_total: '3.330000' };
		couponLines = [{ code: 'probe', discount: '3.33', discount_tax: '0' }];

		render(<Totals />);

		expect(markers()).toEqual({ total: '36.680000', discountTotal: '3.330000' });
	});

	it('are EMPTY, not zero, before the order has settled anything', () => {
		render(<Totals />);

		expect(markers()).toEqual({ total: '', discountTotal: '' });
	});

	it('distinguish a genuine zero from an absent value', () => {
		orderPayload = { total: '0.00', discount_total: '0.00' };

		render(<Totals />);

		expect(markers()).toEqual({ total: '0.00', discountTotal: '0.00' });
	});

	it('render even for an empty cart, so a spec never waits on a marker that will not appear', () => {
		render(<Totals />);

		expect(screen.getByTestId('cart-order-total')).toBeTruthy();
		expect(screen.getByTestId('cart-discount-total')).toBeTruthy();
	});
});
