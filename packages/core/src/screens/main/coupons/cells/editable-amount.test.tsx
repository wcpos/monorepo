/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { EditableAmount } from './editable-amount';

const store = { price_decimal_sep: ',', price_thousand_sep: '.', price_num_decimals: 0 };

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: { payload: object }, select: (r: { payload: object }) => unknown) =>
		select(record),
	useDocField: (_doc: unknown, select: (s: typeof store) => unknown) => select(store),
}));
jest.mock('../../../../contexts/app-state', () => ({ useAppState: () => ({ store: {} }) }));
jest.mock('../../contexts/pro-access', () => ({ useProAccess: () => ({ readOnly: false }) }));
jest.mock('../../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: { canEditCoupons: true } }),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `$${value}` }),
}));
jest.mock('../../components/capability-tooltip', () => ({
	CapabilityTooltip: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../components/money-input', () => ({
	MoneyInput: ({
		value,
		format,
		decimals,
	}: {
		value: string;
		format: (value: number) => string;
		decimals?: number;
	}) => (
		<span data-testid="amount" data-decimals={decimals ?? 'store'}>
			{format(Number(value))}
		</span>
	),
}));

function renderAmount(discount_type: string, amount: string) {
	const record = { payload: { discount_type, amount } };
	const props = {
		row: { original: { record } },
		column: { id: 'amount' },
		table: { options: { meta: { commit: jest.fn() } } },
	} as unknown as Parameters<typeof EditableAmount>[0];
	render(<EditableAmount {...props} />);
	return screen.getByTestId('amount');
}

it('a percentage coupon takes and shows hundredths, even on a store pricing to 0 places', () => {
	const amount = renderAmount('percent', '12.5');
	expect(amount.textContent).toBe('12,5');
	expect(amount.getAttribute('data-decimals')).toBe('2');
});

it.each(['fixed_cart', 'fixed_product'])(
	'a %s coupon is money, at the store currency places',
	(type) => {
		const amount = renderAmount(type, '10');
		expect(amount.textContent).toBe('$10');
		expect(amount.getAttribute('data-decimals')).toBe('store');
	}
);
