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
it('lists the legs without a bar or timeline: event times, Next, and cash-only change', () => {
	render(<LedgerLegs view={view} format={format} />);
	expect(screen.queryByText('Paid £20 · £10 left')).toBeNull();
	for (const id of ['cash', 'card', 'next']) {
		expect(screen.queryByTestId(`checkout-leg-dot-${id}`)).toBeNull();
	}
	for (const id of ['cash', 'card']) {
		expect(within(screen.getByTestId(`checkout-leg-${id}`)).getByText('2:04 PM')).toBeTruthy();
	}
	expect(within(screen.getByTestId('checkout-leg-next')).getByText('Next')).toBeTruthy();
	expect(within(screen.getByTestId('checkout-leg-next')).queryByText('2:04 PM')).toBeNull();
	expect(screen.getByTestId('checkout-leg-cash').textContent).toContain('Tendered');
	expect(screen.getByTestId('checkout-leg-card').textContent).not.toContain('Tendered');
	// Without `closing` (the phone pane) there are no closing rows.
	expect(screen.queryByTestId('checkout-ledger-totals')).toBeNull();
});
it('shows paid in full at zero balance and keeps the empty state', () => {
	const { rerender } = render(
		<LedgerLegs view={{ ...view, rows: view.rows.slice(0, 2), balanceMinor: 0 }} format={format} />
	);
	expect(screen.getByText('Paid in full · 2:04 PM')).toBeTruthy();
	rerender(<LedgerLegs view={{ ...view, rows: [] }} format={format} />);
	expect(screen.getByText('No payments yet')).toBeTruthy();
});
it('closing ends the block with Total, Paid and Remaining, or Paid in full as the lead row', () => {
	const { rerender } = render(<LedgerLegs view={view} format={format} closing />);
	const closing = screen.getByTestId('checkout-ledger-totals');
	expect(closing.textContent).toBe('Total£30Paid£20Remaining£10');
	expect(screen.getByTestId('checkout-order-total').textContent).toBe('£30');
	expect(screen.getByTestId('checkout-ledger-remaining').textContent).toBe('£10');

	rerender(
		<LedgerLegs
			view={{ ...view, rows: view.rows.slice(0, 2), paidMinor: 3000, balanceMinor: 0 }}
			format={format}
			closing
		/>
	);
	// The success line moves into the lead row; it is not printed twice.
	expect(screen.getAllByText('Paid in full · 2:04 PM')).toHaveLength(1);
	expect(screen.getByTestId('checkout-ledger-totals').textContent).not.toContain('Remaining');
	expect(screen.getByTestId('checkout-ledger-remaining').textContent).toBe('£0');

	// Nothing settled (the leg failed): a zero balance is not paid in full.
	rerender(
		<LedgerLegs
			view={{ ...view, rows: [{ ...row, status: 'failed' }], paidMinor: 0, balanceMinor: 0 }}
			format={format}
			closing
		/>
	);
	expect(screen.queryByText(/Paid in full/)).toBeNull();
	expect(screen.getByTestId('checkout-ledger-totals').textContent).toContain('Remaining£0');

	rerender(<LedgerLegs view={{ ...view, rows: [], paidMinor: 0 }} format={format} closing />);
	expect(screen.getByText('No payments yet')).toBeTruthy();
	expect(screen.getByTestId('checkout-ledger-totals').textContent).toContain('Paid£0');
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
