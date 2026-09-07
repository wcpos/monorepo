/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { type PaymentRow, withLedger } from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';

import { TabChip } from './tab-chip';
import { enterCheckout, enterReceipt, resetCheckoutMode } from '../checkout/checkout-mode';

jest.mock('@wcpos/query', () => ({
	useRecordField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('../contexts/current-order/context', () => ({ useCurrentOrder: jest.fn() }));
jest.mock('../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ methods: [] }),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { price_num_decimals: 2 } }),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label, variant, testID }: { label: string; variant: string; testID: string }) => (
		<span data-testid={testID} data-variant={variant}>
			{label}
		</span>
	),
}));
beforeEach(resetCheckoutMode);
it.each([
	['cart', [], null, null],
	['checkout', [], 'In checkout', 'info'],
	[
		'partial',
		[{ id: 'leg', status: 'captured', amount: '4.00', tendered: null }],
		'Partly paid · $6.00 due',
		'info',
	],
	[
		'receipt',
		[{ id: 'leg', status: 'captured', amount: '10.00', tendered: null }],
		'Paid · receipt',
		'success',
	],
] as const)('renders %s from the order payload', (stage, rows, label, variant) => {
	if (stage === 'checkout') enterCheckout('a');
	if (stage === 'receipt') enterReceipt('a');
	const order = {
		uuid: 'a',
		payload: {
			total: '10.00',
			currency_symbol: '$',
			meta_data: withLedger([], rows as unknown as PaymentRow[]),
		},
	} as EngineRecord<'orders'>;
	render(<TabChip order={order} />);
	const chip = screen.queryByTestId('open-order-chip-a');
	if (label === null) expect(chip).toBeNull();
	else {
		expect(chip?.textContent).toBe(label);
		expect(chip?.dataset.variant).toBe(variant);
	}
});
