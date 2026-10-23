/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import type { PaymentRow } from '@wcpos/order-math';

import { CancelPaymentView } from './cancel-payment-view';
import { initialTenderState } from './tender-state';

import type { TenderFlow } from './use-tender-flow';

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string, vars?: Record<string, unknown>) =>
		vars ? `${key} ${JSON.stringify(vars)}` : key,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<button data-testid={testID}>{children}</button>
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
