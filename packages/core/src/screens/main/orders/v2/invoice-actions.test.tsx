/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { getCheckoutModeSnapshot, resetCheckoutMode } from '../../pos/checkout/checkout-mode';
import { GatewayCancelMirrorError } from '../../pos/checkout/payments/submit-gateway-payment';
import { InvoiceActions } from './invoice-actions';

const mockCancel = jest.fn();
const mockReopen = jest.fn();
const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();
jest.mock('../../pos/checkout/payments/use-gateway-payment', () => ({
	useGatewayPayment: () => ({ submit: jest.fn(), cancel: mockCancel }),
}));
jest.mock('./use-reopen-order', () => ({ useReopenOrder: () => mockReopen }));
let mockOnline = 'online-website-available';
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockOnline }),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		info: (...args: unknown[]) => mockInfo(...args),
		warn: (...args: unknown[]) => mockWarn(...args),
		error: (...args: unknown[]) => mockError(...args),
	}),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		disabled,
		onPress,
	}: {
		children?: React.ReactNode;
		testID?: string;
		disabled?: boolean;
		onPress?: () => void;
	}) => (
		<button data-testid={testID} disabled={disabled} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

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
	mockCancel.mockResolvedValue({ kind: 'cancelled', order: { status: 'pos-open' } });
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

it('a cancel the store applied but the till could not save is still a cancel', async () => {
	mockCancel.mockRejectedValue(
		new GatewayCancelMirrorError({ status: 'pos-open' } as never, new Error('disk'))
	);
	render(<InvoiceActions order={order} stamp={stamp} />);
	await act(async () => {
		fireEvent.click(screen.getByTestId('orders-cancel-invoice'));
	});
	expect(mockInfo).toHaveBeenCalledWith(
		'pos_checkout.invoice_cancelled',
		expect.objectContaining({ context: expect.objectContaining({ type: 'checkout.cancelled' }) })
	);
	expect(mockWarn).toHaveBeenCalledWith(
		'pos_checkout.invoice_cancelled_not_synced',
		expect.objectContaining({
			code: 'PAYMENT113',
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
