/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen, within } from '@testing-library/react';

import type { PaymentRow } from '@wcpos/order-math';

import { LedgerLegs } from './ledger-pane';

import type { LedgerView } from './use-ledger-view';

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
jest.mock('../../../../../hooks/use-locale', () => ({ useLocale: () => ({ shortCode: 'en' }) }));
jest.mock('@wcpos/components/collapsible', () => ({
	Collapsible: 'div',
	CollapsibleContent: 'div',
	CollapsibleTrigger: 'div',
}));
jest.mock('@wcpos/components/text', () => ({
	TextClassContext: React.createContext(''),
	Text: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	View: ({
		children,
		testID,
		className,
	}: React.PropsWithChildren<{ testID?: string; className?: string }>) => (
		<div data-testid={testID} className={className}>
			{children}
		</div>
	),
}));
const row: PaymentRow = {
	id: 'cash',
	source: 'app',
	order_id: 1,
	method_id: 'cash',
	provider: null,
	kind: 'cash',
	capture_mode: 'manual',
	transport: null,
	recorded_offline: false,
	amount: '10',
	currency: 'GBP',
	tendered: '20',
	change: '10',
	tip: null,
	status: 'captured',
	failure_reason: null,
	refunded_amount: '0',
	refunds: [],
	provider_refs: {},
	receipt: {},
	cashier_id: 1,
	store_id: 1,
	created_at_gmt: '',
	captured_at_gmt: null,
	updated_at_gmt: '',
	events: [{ t: '2026-09-28T14:04:00', level: 'info', message: 'Taken' }],
};
const view: LedgerView = {
	invoiceSent: null,
	rows: [
		row,
		{ ...row, id: 'card', method_id: 'card', kind: 'card' },
		{ ...row, id: 'next', status: 'pending', kind: 'card', events: [] },
	],
	tiles: [],
	dp: 2,
	totalMinor: 3000,
	paidMinor: 2000,
	balanceMinor: 1000,
};
const format = (minor: number) => `£${minor / 100}`;
it('shows paid and left, timeline dots, event times, Next, and cash-only change', () => {
	render(<LedgerLegs view={view} format={format} />);
	expect(screen.getByText('Paid £20 · £10 left')).toBeTruthy();
	for (const id of ['cash', 'card']) {
		expect(screen.getByTestId(`checkout-leg-dot-${id}`).className).toContain('bg-success');
		expect(within(screen.getByTestId(`checkout-leg-${id}`)).getByText('2:04 PM')).toBeTruthy();
	}
	expect(screen.getByTestId('checkout-leg-dot-next').className).toContain('bg-warning');
	expect(within(screen.getByTestId('checkout-leg-next')).getByText('Next')).toBeTruthy();
	expect(within(screen.getByTestId('checkout-leg-next')).queryByText('2:04 PM')).toBeNull();
	expect(screen.getByTestId('checkout-leg-cash').textContent).toContain('Tendered');
	expect(screen.getByTestId('checkout-leg-card').textContent).not.toContain('Tendered');
});
it('shows paid in full at zero balance and keeps the empty state', () => {
	const { rerender } = render(
		<LedgerLegs view={{ ...view, rows: view.rows.slice(0, 2), balanceMinor: 0 }} format={format} />
	);
	expect(screen.getByText('Paid in full · 2:04 PM')).toBeTruthy();
	rerender(<LedgerLegs view={{ ...view, rows: [] }} format={format} />);
	expect(screen.getByText('No payments yet')).toBeTruthy();
});
it('a sent order with no money taken says where the invoice went instead of the empty state', () => {
	render(
		<LedgerLegs
			view={{
				...view,
				rows: [],
				invoiceSent: {
					method_id: 'wcpos_email_invoice',
					destination: 'buyer@example.com',
					attempt_id: 'a',
					sent_at_gmt: '',
					cashier_id: 1,
				},
			}}
			format={format}
		/>
	);
	expect(screen.getByTestId('checkout-ledger-sent').textContent).toBe(
		'Invoice sent to buyer@example.com · awaiting the customer'
	);
	expect(screen.queryByText('No payments yet')).toBeNull();
});
