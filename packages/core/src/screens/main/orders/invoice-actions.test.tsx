/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { getCheckoutModeSnapshot, resetCheckoutMode } from '../pos/checkout/checkout-mode';
import { useInvoiceActions } from './invoice-actions';

const mockCancel = jest.fn();
const mockReopen = jest.fn();
const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();
jest.mock('../pos/checkout/payments/use-gateway-payment', () => ({
	useGatewayPayment: () => ({ submit: jest.fn(), cancel: mockCancel }),
}));
let mockReopening = false;
jest.mock('./use-reopen-order', () => ({
	useReopenOrder: () => ({ reopen: mockReopen, reopening: mockReopening }),
}));
let mockOnline = 'online-website-available';
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockOnline }),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
	getLogger: () => ({
		info: (...args: unknown[]) => mockInfo(...args),
		warn: (...args: unknown[]) => mockWarn(...args),
		error: (...args: unknown[]) => mockError(...args),
	}),
}));

function InvoiceActions(props: Parameters<typeof useInvoiceActions>[0]) {
	const { destructive, secondary } = useInvoiceActions(props);
	return (
		<>
			{[...destructive, ...secondary].map((action) => (
				<button
					key={action.testID}
					data-testid={action.testID}
					disabled={action.disabled}
					onClick={action.onPress as React.MouseEventHandler}
				>
					{action.label}
				</button>
			))}
		</>
	);
}

const order = { uuid: 'order-1' } as EngineRecord<'orders'>;
const stamp = {
	method_id: 'wcpos_email_invoice',
	destination: 'buyer@example.com',
	attempt_id: 'attempt-0',
	sent_at_gmt: '2026-10-08T10:00:00.000Z',
	cashier_id: 7,
};
beforeEach(() => {
	jest.clearAllMocks();
	resetCheckoutMode();
	mockOnline = 'online-website-available';
	mockReopening = false;
});

it('Send again is disabled while a reopen of the order awaits the store', () => {
	mockReopening = true;
	render(<InvoiceActions order={order} stamp={stamp} />);
	expect(screen.getByTestId('orders-send-again').hasAttribute('disabled')).toBe(true);
});

it('Cancel invoice needs the store: offline it is disabled, Send again is not', () => {
	mockOnline = 'offline';
	render(<InvoiceActions order={order} stamp={stamp} />);
	expect(screen.getByTestId('orders-cancel-invoice').hasAttribute('disabled')).toBe(true);
	expect(screen.getByTestId('orders-send-again').hasAttribute('disabled')).toBe(false);
});

it('Send again re-opens the order with the gateway already chosen', () => {
	render(<InvoiceActions order={order} stamp={stamp} />);
	fireEvent.click(screen.getByTestId('orders-send-again'));
	expect(getCheckoutModeSnapshot().tenderMethods.get('order-1')).toBe('wcpos_email_invoice');
	expect(mockReopen).toHaveBeenCalled();
});

it("Cancel invoice names the stamp's attempt and reports the order open again", async () => {
	mockCancel.mockResolvedValue({
		kind: 'answered',
		reopened: true,
		order: { status: 'pos-open' },
		notMirrored: null,
	});
	render(<InvoiceActions order={order} stamp={stamp} />);
	await act(async () => {
		fireEvent.click(screen.getByTestId('orders-cancel-invoice'));
	});
	expect(mockCancel).toHaveBeenCalledWith(order, stamp);
	expect(mockInfo).toHaveBeenCalledWith(
		'pos_checkout.invoice_cancelled',
		expect.objectContaining({ showToast: true })
	);
	expect(screen.getByTestId('orders-cancel-invoice').hasAttribute('disabled')).toBe(false);
});

// As the till's own cancel does: an answer with the order not open again did not cancel the
// invoice, whether or not its mirror landed.
it.each([
	[
		'answered',
		() =>
			mockCancel.mockResolvedValue({
				kind: 'answered',
				reopened: false,
				order: { status: 'completed' },
			}),
	],
	[
		'answered but not mirrored',
		() =>
			mockCancel.mockResolvedValue({
				kind: 'answered',
				reopened: false,
				order: { status: 'completed' },
				notMirrored: { cause: new Error('disk') },
			}),
	],
])('an unchanged cancel (%s) says the invoice was not cancelled', async (_label, arrange) => {
	arrange();
	render(<InvoiceActions order={order} stamp={stamp} />);
	await act(async () => {
		fireEvent.click(screen.getByTestId('orders-cancel-invoice'));
	});
	expect(mockWarn).toHaveBeenCalledWith(
		'pos_checkout.invoice_not_cancelled',
		expect.objectContaining({ showToast: true })
	);
	expect(mockInfo).not.toHaveBeenCalledWith('pos_checkout.invoice_cancelled', expect.anything());
	expect(mockError).not.toHaveBeenCalled();
});

it('a cancel the store applied but the till could not save is still a cancel', async () => {
	mockCancel.mockResolvedValue({
		kind: 'answered',
		reopened: true,
		order: { status: 'pos-open' },
		notMirrored: { cause: new Error('disk') },
	});
	render(<InvoiceActions order={order} stamp={stamp} />);
	await act(async () => {
		fireEvent.click(screen.getByTestId('orders-cancel-invoice'));
	});
	expect(mockInfo).toHaveBeenCalledWith(
		'pos_checkout.invoice_cancelled',
		expect.objectContaining({ context: expect.objectContaining({ type: 'checkout.cancelled' }) })
	);
	// One toast: the not-synced warning, never a plain "cancelled" beside it.
	expect(mockInfo).not.toHaveBeenCalledWith(
		'pos_checkout.invoice_cancelled',
		expect.objectContaining({ showToast: true })
	);
	expect(mockWarn).toHaveBeenCalledWith(
		'pos_checkout.invoice_cancelled_not_synced',
		expect.objectContaining({
			code: 'PAYMENT113',
			context: expect.objectContaining({ error: 'disk' }),
			toast: { title: 'pos_checkout.invoice_cancelled_not_synced' },
		})
	);
	expect(mockError).not.toHaveBeenCalled();
});

it('a refused cancel is reported with the gateway code and nothing else changes', async () => {
	mockCancel.mockResolvedValue({
		kind: 'refused',
		code: 'wcpos_payment_conflict',
		message: 'Another attempt is current.',
	});
	render(<InvoiceActions order={order} stamp={stamp} />);
	await act(async () => {
		fireEvent.click(screen.getByTestId('orders-cancel-invoice'));
	});
	expect(mockError).toHaveBeenCalledWith(
		'Another attempt is current.',
		expect.objectContaining({ code: 'PAYMENT212', showToast: true })
	);
	expect(mockInfo).not.toHaveBeenCalled();
});

it('returns no invoice actions without an invoice stamp', () => {
	const { result } = renderHook(() => useInvoiceActions({ order, stamp: null }));
	expect(result.current.destructive).toEqual([]);
	expect(result.current.secondary).toEqual([]);
});
