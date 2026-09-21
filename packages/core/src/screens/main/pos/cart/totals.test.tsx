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
let couponLines: {
	code?: string;
	discount?: string;
	discount_tax?: string;
	meta_data?: { key: string; value: unknown }[];
}[] = [];

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
	const React = jest.requireActual('react');
	const { Text } = jest.requireActual('react-native');
	// Expose the remove control's accessible name so the label assertions can see it.
	function ButtonPill({
		removeAccessibilityLabel,
		children,
	}: {
		removeAccessibilityLabel?: string;
		children?: React.ReactNode;
	}) {
		return React.createElement('div', { 'aria-label': removeAccessibilityLabel }, children);
	}
	return { ButtonPill, ButtonText: Text };
});

jest.mock('./totals/customer-note', () => ({ CustomerNote: () => null }));
jest.mock('./totals/taxes', () => ({ Taxes: () => null }));

jest.mock('../../../../contexts/translations', () => {
	const i18n = jest.requireActual('i18next').createInstance();
	i18n.init({
		lng: 'en',
		initImmediate: false,
		keySeparator: false,
		resources: {
			en: {
				translation: jest.requireActual('../../../../contexts/translations/locales/en/core.json'),
			},
		},
		interpolation: { prefix: '{', suffix: '}', escapeValue: false },
	});
	return { useT: () => i18n.t };
});
jest.mock('../../hooks/use-current-order-currency-format', () => ({
	useCurrentOrderCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));
// A comma-locale store: the percent inside the discount label must follow it.
jest.mock('../../hooks/use-number-format', () => ({
	useNumberFormat: () => ({ format: (value: number) => String(value).replace('.', ',') }),
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

it.each([
	['fixed_cart', '10.00', 'Discount'],
	['percent', '10.00', 'Discount (10%)'],
	// The store formats numbers with a comma; the label follows the store, not the wire.
	['percent', '12.5', 'Discount (12,5%)'],
])('labels %s %s pills and keeps plain coupon codes', (discount_type, amount, label) => {
	couponLines = [
		{
			code: 'pos-discount',
			discount: '10',
			meta_data: [{ key: '_wcpos_quick_discount', value: { discount_type, amount } }],
		},
		{ code: 'SAVE10', discount: '1' },
	];
	render(<Totals />);
	expect(screen.getByText(label)).toBeTruthy();
	expect(screen.getByLabelText(`Remove ${label}`)).toBeTruthy();
	expect(screen.getByText('SAVE10')).toBeTruthy();
	expect(screen.queryByText('pos-discount')).toBeNull();
});
