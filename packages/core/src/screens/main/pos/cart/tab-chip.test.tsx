/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { type PaymentRow, withAwaitingCustomer, withLedger } from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';

import { TabChip, TabToneContext } from './tab-chip';
import {
	enterCheckout,
	enterReceipt,
	markOrderQueuedOffline,
	markOrderSaveRejected,
	markOrderSaving,
	resetCheckoutMode,
} from '../checkout/checkout-mode';

jest.mock('@wcpos/query', () => ({
	useRecordField: <T,>(source: T, select: (value: T) => unknown) => select(source),
	useDocField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('../contexts/current-order/context', () => ({ useCurrentOrder: jest.fn() }));
jest.mock('../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ methods: [] }),
}));
const mockSession = { store: { price_num_decimals: 2 }, storeDB: {} };
jest.mock('../../../../contexts/app-state', () => ({ useStoreSession: () => mockSession }));
const mockAwaiting$ = new BehaviorSubject<ReadonlySet<string>>(new Set());
let mockUnread = false;
jest.mock('@wcpos/query/store-local', () => ({
	observeAwaitingStore: () => (mockUnread ? jest.requireActual('rxjs').NEVER : mockAwaiting$),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label, variant, testID }: { label: string; variant: string; testID: string }) => (
		<span data-testid={testID} data-variant={variant}>
			{label}
		</span>
	),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
beforeEach(() => {
	resetCheckoutMode();
	mockUnread = false;
	mockAwaiting$.next(new Set());
});
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

it.each([
	['saving', 'Saving order…', 'info'],
	['queued-offline', 'In checkout · offline', 'info'],
	['rejected', 'Save refused', 'error'],
])('labels a %s order', (kind, label, variant) => {
	enterCheckout('a');
	markOrderSaving('a');
	if (kind === 'queued-offline') markOrderQueuedOffline('a', 'm');
	if (kind === 'rejected') {
		enterReceipt('a');
		markOrderSaveRejected('a', { status: null, reason: null, message: null });
	}
	const order = {
		uuid: 'a',
		payload: { total: '10.00', meta_data: [] },
	} as unknown as EngineRecord<'orders'>;
	render(<TabChip order={order} />);
	const chip = screen.getByTestId('open-order-chip-a');
	expect(chip.textContent).toBe(label);
	expect(chip.dataset.variant).toBe(variant);
});
it.each(['pending', 'authorized'] as const)(
	'server %s takes precedence over checkout and partly paid',
	(status) => {
		enterCheckout('a');
		const order = {
			uuid: 'a',
			payload: {
				total: '10.00',
				meta_data: withLedger([], [
					{ id: 'cash', status: 'captured', amount: '2.00', tendered: null },
					{ id: 'terminal', status, amount: '8.00', capture_mode: 'server', tendered: null },
				] as PaymentRow[]),
			},
		} as EngineRecord<'orders'>;
		const { rerender } = render(<TabChip order={order} />);
		expect(screen.getByTestId('open-order-chip-a').textContent).toBe(
			'Waiting for terminal · $8.00'
		);
		act(() => enterReceipt('a'));
		rerender(<TabChip order={order} />);
		expect(screen.getByTestId('open-order-chip-a').textContent).toBe('Paid · receipt');
	}
);

// ADR 0040 D6: an authorization is a hold, not payment, so it never reads as partly paid.
it('an authorized leg in checkout reads In checkout, not Partly paid', () => {
	enterCheckout('a');
	const order = {
		uuid: 'a',
		payload: {
			total: '10.00',
			currency_symbol: '$',
			meta_data: withLedger([], [
				{ id: 'card', status: 'authorized', amount: '4.00', tendered: null },
			] as PaymentRow[]),
		},
	} as EngineRecord<'orders'>;
	render(<TabChip order={order} />);
	expect(screen.getByTestId('open-order-chip-a').textContent).toBe('In checkout');
});

it('a sent order at its receipt moment reads Invoice sent, not Paid', () => {
	enterReceipt('a');
	const order = {
		uuid: 'a',
		payload: {
			total: '10.00',
			meta_data: withAwaitingCustomer([], {
				method_id: 'wcpos_email_invoice',
				attempt_id: 'x',
				destination: 'b@c.d',
				sent_at_gmt: '',
				cashier_id: 0,
			}),
		},
	} as unknown as EngineRecord<'orders'>;
	render(<TabChip order={order} />);
	expect(screen.getByTestId('open-order-chip-a').textContent).toBe('Invoice sent · receipt');
});

it('suppresses active chips and renders a phone dot without a word', () => {
	enterCheckout('a');
	const order = {
		uuid: 'a',
		payload: { total: '10.00', meta_data: [] },
	} as unknown as EngineRecord<'orders'>;
	const { rerender } = render(<TabChip order={order} active />);
	expect(screen.queryByTestId('open-order-chip-a')).toBeNull();
	rerender(<TabChip order={order} compact />);
	expect(screen.getByTestId('open-order-chip-a').textContent).toBe('');
	expect(screen.getByTestId('open-order-chip-a').dataset.variant).toBe('info');
});
it('keeps a caller status fallback as a badge, and the strip word as plain text', () => {
	const order = {
		uuid: 'a',
		payload: { total: '10.00', meta_data: [] },
	} as unknown as EngineRecord<'orders'>;
	const { rerender } = render(<TabChip order={order} fallbackLabel="Cart" />);
	expect(screen.queryByTestId('open-order-chip-a')).toBeNull();
	expect(screen.getByTestId('open-order-status-a').textContent).toBe('Cart');
	// The open-orders list passes the order's real status: still a badge, as before.
	rerender(<TabChip order={order} fallbackLabel="POS - Open" fallbackIsStatus />);
	expect(screen.queryByTestId('open-order-status-a')).toBeNull();
	expect(screen.getByTestId('open-order-chip-a').textContent).toBe('POS - Open');
});

it('labels a paid checkout member as Paid · receipt before confirmation', () => {
	enterCheckout('a');
	const order = {
		uuid: 'a',
		payload: { total: '10.00', status: 'completed', meta_data: [] },
	} as unknown as EngineRecord<'orders'>;
	render(<TabChip order={order} />);
	expect(screen.getByTestId('open-order-chip-a').textContent).toBe('Paid · receipt');
});

// ADR 0040 Decided 1 rule 1: the mark is the journals (`observeAwaitingStore`), never the status.
it('an awaiting sale keeps its mark while the status flickers back to open on reconnect', () => {
	enterCheckout('a');
	mockAwaiting$.next(new Set(['a']));
	const order = (status: string, rows: unknown[]) =>
		({
			uuid: 'a',
			payload: { total: '10.00', status, meta_data: withLedger([], rows as PaymentRow[]) },
		}) as unknown as EngineRecord<'orders'>;
	const paid = [{ id: 'cash', status: 'captured', amount: '10.00', tendered: null }];
	const { rerender } = render(<TabChip order={order('completed', paid)} />);
	expect(screen.getByTestId('open-order-chip-a').textContent).toBe('Paid · awaiting store');
	expect(screen.getByTestId('open-order-chip-a').dataset.variant).toBe('warning');
	// `readopt` adopts the still-unpaid server document before the record lands.
	rerender(<TabChip order={order('pos-open', [])} />);
	expect(screen.getByTestId('open-order-chip-a').textContent).toBe('Awaiting store · $10.00 due');
	expect(screen.getByTestId('open-order-chip-a').dataset.variant).toBe('warning');
	// Active: plain text, no dot.
	rerender(<TabChip order={order('pos-open', [])} active />);
	expect(screen.queryByTestId('open-order-chip-a')).toBeNull();
	expect(screen.getByTestId('open-order-status-a').textContent).toBe('Awaiting store · $10.00 due');
	// The store answers: the mark goes.
	act(() => mockAwaiting$.next(new Set()));
	rerender(<TabChip order={order('completed', paid)} />);
	expect(screen.getByTestId('open-order-chip-a').textContent).toBe('Paid · receipt');
});

it('a journal not read yet is not awaiting: no tab flashes amber as it mounts', () => {
	mockUnread = true;
	enterReceipt('a');
	const order = {
		uuid: 'a',
		payload: { total: '10.00', status: 'completed', meta_data: [] },
	} as unknown as EngineRecord<'orders'>;
	render(<TabChip order={order} />);
	expect(screen.getByTestId('open-order-chip-a').textContent).toBe('Paid · receipt');
	expect(screen.getByTestId('open-order-chip-a').dataset.variant).toBe('success');
});

it('an awaiting sale with nothing due reads Paid · awaiting store whatever its stage', () => {
	mockAwaiting$.next(new Set(['a']));
	const order = {
		uuid: 'a',
		payload: {
			total: '10.00',
			status: 'pos-open',
			meta_data: withLedger([], [
				{ id: 'cash', status: 'captured', amount: '10.00', tendered: null },
			] as PaymentRow[]),
		},
	} as unknown as EngineRecord<'orders'>;
	render(<TabChip order={order} />);
	expect(screen.getByTestId('open-order-chip-a').textContent).toBe('Paid · awaiting store');
});

it('reports warning/error tone changes and clears its registry entry on unmount', () => {
	const report = jest.fn();
	const order = {
		uuid: 'a',
		payload: {
			total: '10.00',
			meta_data: withLedger(
				[],
				[
					{
						id: 'terminal',
						status: 'pending',
						amount: '10.00',
						capture_mode: 'server',
						tendered: null,
					} as PaymentRow,
				]
			),
		},
	} as EngineRecord<'orders'>;
	const { unmount } = render(
		<TabToneContext.Provider value={report}>
			<TabChip order={order} />
		</TabToneContext.Provider>
	);
	expect(report).toHaveBeenLastCalledWith('a', 'warning');
	expect(screen.getByTestId('open-order-chip-a').dataset.variant).toBe('warning');
	act(() => markOrderSaveRejected('a', { status: null, reason: null, message: null }));
	expect(report).toHaveBeenLastCalledWith('a', 'error');
	unmount();
	expect(report).toHaveBeenLastCalledWith('a', null);
});
