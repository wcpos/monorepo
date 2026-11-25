/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen, within } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { CartHeader } from './cart-header';
import { StilledCart } from './stilled-cart';

let mockPayload: Record<string, unknown> = {};
const mockCartTable = jest.fn();
let mockCurrentOrder: { uuid: string } = { uuid: 'order-1' };

// The library empty state pulls uniwind and expo-linking into Jest; its title is what this suite reads.
jest.mock('@wcpos/components/empty-state', () => ({
	EmptyState: ({ testID, title }: { testID?: string; title: string }) => (
		<span data-testid={testID}>{title}</span>
	),
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: (
		record: { payload?: unknown } | undefined,
		select: (value: unknown) => unknown
	) => select({ payload: record?.payload ?? mockPayload }),
}));
jest.mock('../contexts/current-order', () => {
	const React = jest.requireActual<typeof import('react')>('react');
	const CurrentOrderContext = React.createContext<unknown>(null);
	return {
		CurrentOrderContext,
		useCurrentOrder: () =>
			(React.useContext(CurrentOrderContext) as object | null) ?? {
				currentOrderRecord: mockCurrentOrder,
			},
	};
});
let mockSplitOn = false;
let mockView: Record<string, unknown> = {};
const mockPickUnits = jest.fn();
jest.mock('../checkout/checkout-mode', () => ({
	pickUnits: (...args: unknown[]) => mockPickUnits(...args),
}));
jest.mock('../checkout/tender/use-ledger-view', () => ({
	useLedgerView: () => ({
		totalMinor: 5000,
		paidMinor: 705,
		balanceMinor: 4295,
		rows: [],
		split: {
			allocations: {},
			// 10.00 over three units: 3.33, 3.33, then 3.34 on the last.
			lines: [{ id: 'line-1', name: 'Tea', quantity: 3, totalMinor: 1000 }],
			paidUnits: { 'line-1': { units: 1, methods: ['Cash'] } },
			picked: { 'line-1': 1 },
			pickable: true,
			splitOn: mockSplitOn,
		},
		format: (minor: number) => `$${(minor / 100).toFixed(2)}`,
		...mockView,
	}),
}));
jest.mock('./totals', () => ({
	Totals: ({ readOnly }: { readOnly?: boolean }) => (
		<div data-testid="cart-totals" data-readonly={String(readOnly)} />
	),
}));
jest.mock('../../../../hooks/use-store-day-label', () => ({
	useStoreDayLabel: () => ({ dateTime: (iso: string) => `Today · ${iso.slice(11, 16)}` }),
}));
jest.mock('../../../../hooks/use-local-date', () => ({
	useLocalDate: () => ({ formatDate: () => '9:28 PM' }),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/status-badge', () => ({ StatusBadge: () => null }));
jest.mock('./table', () => {
	const { useCurrentOrder } = jest.requireMock('../contexts/current-order');
	return {
		CartTable: (props: { footer?: React.ReactNode }) => {
			mockCartTable({ ...props, order: useCurrentOrder().currentOrderRecord });
			return <div data-testid="cart-table">{props.footer}</div>;
		},
	};
});
jest.mock('../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({
		format: ({ billing }: { billing?: { first_name?: string } }) => billing?.first_name || 'Guest',
	}),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
// The live head's controls: present only to prove the stilled head drops them.
jest.mock('./add-cart-items-menu', () => ({
	AddCartItemsMenu: () => <div data-testid="add-cart-items" />,
}));
jest.mock('../../components/ui-settings', () => ({
	UISettingsDialog: () => <div data-testid="cart-settings-button" />,
}));
jest.mock('./customer', () => ({ Customer: () => <div data-testid="cart-customer-name" /> }));
jest.mock('./ui-settings-form', () => ({ UISettingsForm: () => null }));
jest.mock('../../components/customer-select', () => ({ CustomerSearch: () => null }));
jest.mock('@wcpos/components/combobox', () => ({}));
jest.mock('@wcpos/components/chip', () => ({ Chip: () => null }));
jest.mock('../contexts/overlay-side', () => ({ usePanelSide: () => 'left' }));
jest.mock('../hooks/use-add-customer', () => ({
	useAddCustomer: () => ({ addCustomer: jest.fn() }),
}));

beforeEach(() => {
	mockPayload = {
		number: '1187',
		billing: { first_name: 'Ada' },
		customer_id: 3,
		date_created_gmt: '2026-10-23T21:28:00',
	};
	mockCurrentOrder = { uuid: 'order-1' };
	mockView = {};
	mockCartTable.mockClear();
});

describe('CartHeader stilled', () => {
	it('is one identity line, number · customer · time, where the controls were', () => {
		render(<CartHeader stilled />);
		expect(screen.getByTestId('checkout-ledger-header').textContent).toBe(
			'#1187 · Ada · Today · 21:28'
		);
		expect(screen.getByTestId('checkout-ledger-customer').textContent).toBe('Ada');
		expect(screen.getByTestId('checkout-ledger-number').textContent).toBe('#1187');
		expect(screen.queryByTestId('add-cart-items')).toBeNull();
		expect(screen.queryByTestId('cart-settings-button')).toBeNull();
		expect(screen.queryByTestId('cart-customer-name')).toBeNull();
	});

	it('holds a placeholder, never an empty "#", while the order has no number (saving, offline, refused)', () => {
		mockPayload = { billing: {}, customer_id: 0 };
		render(<CartHeader stilled />);
		expect(screen.getByTestId('checkout-ledger-number-skeleton')).toBeTruthy();
		expect(screen.queryByTestId('checkout-ledger-number')).toBeNull();
		expect(screen.getByTestId('checkout-ledger-customer').textContent).toBe('Guest');
		// No creation time yet: the line ends at the customer.
		expect(screen.getByTestId('checkout-ledger-header').textContent).toBe(' · Guest');
	});

	it('is the live head without the prop', () => {
		render(<CartHeader />);
		expect(screen.getByTestId('cart-customer-name')).toBeTruthy();
		expect(screen.getByTestId('add-cart-items')).toBeTruthy();
		expect(screen.queryByTestId('checkout-ledger-header')).toBeNull();
	});
});

describe('StilledCart', () => {
	const receipt = {
		uuid: 'order-9',
		payload: { number: '42', billing: { first_name: 'Grace' } },
	} as unknown as EngineRecord<'orders'>;

	it('renders the order it is given, not the current order, read-only with its payments and totals', () => {
		render(<StilledCart order={receipt} />);
		expect(screen.getByTestId('checkout-ledger-number').textContent).toBe('#42');
		expect(screen.getByTestId('checkout-ledger-customer').textContent).toBe('Grace');
		const props = mockCartTable.mock.calls.at(-1)?.[0];
		expect(props.readOnly).toBe(true);
		// The paid marks show whether or not Split is on; the picker only while it is.
		expect(props.paid).toEqual({ 'line-1': { units: 1, methods: ['Cash'] } });
		expect(props.picker).toBeUndefined();
		expect(props.order).toBe(receipt);
		// Totals, then the payments and their closing rows, all inside the rows' scroll.
		const table = screen.getByTestId('cart-table');
		expect(within(table).getByTestId('cart-totals').dataset.readonly).toBe('true');
		expect(table.textContent).toContain('pos_checkout.payments_tab');
		expect(table.textContent).toContain('pos_checkout.no_payments_yet');
		const closing = within(table).getByTestId('checkout-ledger-totals');
		expect(within(closing).getByTestId('checkout-order-total').textContent).toBe('$50.00');
		expect(within(closing).getByTestId('checkout-ledger-remaining').textContent).toBe('$42.95');
		expect(closing.textContent).toContain('$7.05');
		// Nothing pinned under the scroll.
		expect(screen.getAllByTestId('checkout-ledger-totals')).toHaveLength(1);
	});

	it('is the split picker while Split is on: the store’s picks, priced after the paid units', () => {
		mockSplitOn = true;
		render(<StilledCart order={receipt} />);
		const { picker } = mockCartTable.mock.calls.at(-1)?.[0];
		expect(picker.picked).toEqual({ 'line-1': 1 });
		expect(picker.paid).toEqual({ 'line-1': { units: 1, methods: ['Cash'] } });
		// One unit paid: the next costs 3.33, the last two 6.67 (the remainder cents on the last).
		expect(picker.unitMinor('line-1', 1)).toBe(333);
		expect(picker.unitMinor('line-1', 2)).toBe(667);
		expect(picker.format(667)).toBe('$6.67');
		picker.pick('line-1', 2);
		expect(mockPickUnits).toHaveBeenCalledWith('order-9', 'line-1', 2);
		mockSplitOn = false;
	});

	// #3755: paid on the store's pay page, which writes no till payment record.
	const paidOnStore = (payload: Record<string, unknown> = {}) =>
		({
			uuid: 'order-9',
			payload: {
				number: '42',
				total: '45.00',
				status: 'processing',
				date_paid_gmt: '2026-11-23T03:30:00',
				payment_method: 'cod',
				payment_method_title: 'Cash on delivery',
				meta_data: [],
				...payload,
			},
		}) as unknown as EngineRecord<'orders'>;
	const closingOf = () => within(screen.getByTestId('checkout-ledger-totals'));

	// Revert: drop the storeTender prop from StilledCart's LedgerLegs.
	it('a paid order the store took with no record shows its one row, Paid the total, nothing left', () => {
		mockView = { dp: 2, totalMinor: 4500, paidMinor: 0, balanceMinor: 4500, rows: [] };
		render(<StilledCart order={paidOnStore()} />);
		expect(closingOf().getByTestId('checkout-ledger-remaining').textContent).toBe('$0.00');
		expect(screen.getByTestId('cart-table').textContent).not.toContain(
			'pos_checkout.no_payments_yet'
		);
		expect(screen.getByTestId('checkout-ledger').textContent).toContain('Cash on delivery');
		expect(screen.getByTestId('checkout-ledger').textContent).toContain('$45.00');
	});

	// Revert: drop the rowCount check in storeSettledTender.
	it('records win: a part-paid order shows its record, Paid and Remaining, and no store row', () => {
		const record = { id: 'cash-1', method_id: 'pos_cash', amount: '20.00', status: 'captured' };
		mockView = {
			dp: 2,
			tiles: [],
			totalMinor: 4500,
			paidMinor: 2000,
			balanceMinor: 2500,
			rows: [record],
		};
		render(<StilledCart order={paidOnStore()} />);
		expect(screen.getByTestId('checkout-leg-cash-1').textContent).toContain('$20.00');
		expect(closingOf().getByTestId('checkout-ledger-remaining').textContent).toBe('$25.00');
		expect(screen.getByTestId('checkout-ledger-totals').textContent).toContain('$20.00');
		expect(screen.getByTestId('cart-table').textContent).not.toContain('Cash on delivery');
	});

	// Revert: drop the paid-status check in storeSettledTender.
	it('a pending order with no records still shows No payments yet and the total remaining', () => {
		mockView = { dp: 2, totalMinor: 4500, paidMinor: 0, balanceMinor: 4500, rows: [] };
		render(<StilledCart order={paidOnStore({ status: 'pending', date_paid_gmt: null })} />);
		expect(screen.getByTestId('cart-table').textContent).toContain('pos_checkout.no_payments_yet');
		expect(closingOf().getByTestId('checkout-ledger-remaining').textContent).toBe('$45.00');
		expect(screen.getByTestId('cart-table').textContent).not.toContain('Cash on delivery');
	});
});
