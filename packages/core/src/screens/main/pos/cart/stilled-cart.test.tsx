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
jest.mock('../checkout/checkout-mode', () => ({
	useCheckoutMode: () => ({ linesPaidBy: new Map([['order-9', { 'line-1': ['Cash'] }]]) }),
}));
jest.mock('../checkout/tender/use-ledger-view', () => ({
	useLedgerView: () => ({
		totalMinor: 5000,
		paidMinor: 705,
		balanceMinor: 4295,
		rows: [],
		format: (minor: number) => `$${(minor / 100).toFixed(2)}`,
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
		expect(props.paidBy).toEqual({ 'line-1': ['Cash'] });
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
});
