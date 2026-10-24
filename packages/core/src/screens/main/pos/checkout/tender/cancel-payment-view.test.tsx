/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { partitionVoidableRows, type PaymentRow } from '@wcpos/order-math';

import { CancelPaymentView } from './cancel-payment-view';
import { initialTenderState } from './tender-state';

import type { TenderFlow } from './use-tender-flow';

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string, vars?: Record<string, unknown>) =>
		vars ? `${key} ${JSON.stringify(vars)}` : key,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		disabled,
		loading,
	}: {
		children?: React.ReactNode;
		testID?: string;
		disabled?: boolean;
		loading?: boolean;
	}) => (
		<button data-testid={testID} data-loading={loading ? 'true' : undefined} disabled={!!disabled}>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

const row = (
	id: string,
	overrides: Partial<PaymentRow> & Pick<PaymentRow, 'status' | 'kind' | 'capture_mode'>
): PaymentRow =>
	({
		id,
		method_id: id,
		amount: '10.00',
		...overrides,
	}) as PaymentRow;

const flow = (liveRows: PaymentRow[], retainedRows: PaymentRow[]) =>
	({
		state: initialTenderState,
		dp: 2,
		tiles: [],
		liveRows,
		retainedRows,
	}) as unknown as TenderFlow;

const format = (minor: number) => `€${(minor / 100).toFixed(2)}`;

// A captured card leg is kept by `voidPayments` and reported `captured_refund_required`, so the
// confirm must say refund; a cash leg is handed back; a pending or authorized card leg is voided.
it('tells the cashier which legs are voided, returned, and which need a refund instead', () => {
	const cash = row('cash', { status: 'captured', kind: 'cash', capture_mode: 'manual' });
	const pendingCard = row('pending', { status: 'pending', kind: 'card', capture_mode: 'server' });
	const capturedCard = row('card', { status: 'captured', kind: 'card', capture_mode: 'server' });

	render(
		<CancelPaymentView
			flow={flow([cash, pendingCard, capturedCard], [capturedCard])}
			format={format}
		/>
	);

	expect(screen.getByTestId('checkout-cancel-leg-cash').textContent).toContain(
		'pos_checkout.return_cash'
	);
	expect(screen.getByTestId('checkout-cancel-leg-pending').textContent).toContain(
		'pos_checkout.void_on_method'
	);
	expect(screen.getByTestId('checkout-cancel-leg-card').textContent).toContain(
		'pos_checkout.refund_on_method'
	);
	expect(screen.getByTestId('checkout-cancel-leg-card').textContent).not.toContain(
		'void_on_method'
	);
});

// The hook feeds the view `partitionVoidableRows(meta_data).retained`, the void command's own
// rule: a captured cash row a completion already counted is kept too, so it reads refund, not
// return cash.
it('a captured cash row a completion counted reads as a refund, through the void rule itself', () => {
	const counted = row('counted', { status: 'captured', kind: 'cash', capture_mode: 'manual' });
	const open = row('open', { status: 'captured', kind: 'cash', capture_mode: 'manual' });
	const meta_data = [
		{ key: '_wcpos_payments', value: { schema: 1, payments: [counted, open] } },
		{ key: '_wcpos_completions', value: [{ payment_ids: ['counted'] }] },
	] as never;
	const { retained } = partitionVoidableRows(meta_data);
	expect(retained.map(({ id }) => id)).toEqual(['counted']);

	render(<CancelPaymentView flow={flow([counted, open], retained)} format={format} />);

	expect(screen.getByTestId('checkout-cancel-leg-counted').textContent).toContain(
		'pos_checkout.refund_on_method'
	);
	expect(screen.getByTestId('checkout-cancel-leg-open').textContent).toContain(
		'pos_checkout.return_cash'
	);
});

// C5-S1: Cancel and void spins only for its own command; both buttons are disabled on busy.
it.each([
	['cancelPayment', true],
	['takeTender', false],
] as const)('Cancel and void while %s holds the gate spins: %s', (running, spins) => {
	const cash = row('cash', { status: 'captured', kind: 'cash', capture_mode: 'manual' });
	render(<CancelPaymentView flow={{ ...flow([cash], []), busy: true, running }} format={format} />);
	const confirm = screen.getByTestId('checkout-cancel-confirm');
	expect(confirm.hasAttribute('data-loading')).toBe(spins);
	expect(confirm.hasAttribute('disabled')).toBe(true);
	expect(screen.getByTestId('checkout-cancel-keep-going').hasAttribute('disabled')).toBe(true);
});
