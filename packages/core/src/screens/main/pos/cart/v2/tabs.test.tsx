/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { OpenOrderTabs } from './tabs';
import {
	enterReceipt,
	finishReceipt,
	getCheckoutModeSnapshot,
	resetCheckoutMode,
} from '../../checkout/checkout-mode';
import { CartTabTitle } from '../tab-title';

// RN Web drops className without Uniwind's app transform; keep the supplied classes observable.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	const host = (tag: string) =>
		React.forwardRef<
			HTMLElement,
			{
				children?: React.ReactNode;
				className?: string;
				testID?: string;
				onPress?: () => void;
				role?: string;
				'aria-selected'?: boolean;
			}
		>(function Host(
			{ children, className, testID, onPress, role, 'aria-selected': selected },
			ref
		) {
			return React.createElement(
				tag,
				{
					ref,
					className,
					'data-testid': testID,
					onClick: onPress,
					role,
					'aria-selected': selected,
				},
				children
			);
		});
	return { ...actual, View: host('div'), Pressable: host('button'), Text: host('span') };
});
const mockSetOrder = jest.fn();
const mockRecord = (uuid: string, date: string) => ({
	uuid,
	payload: { date_created_gmt: date, total: '10.00', refunds: [], meta_data: [] },
});
const mockOpen = [{ id: 'open', record: mockRecord('open', '2026-09-07T12:00:00') }];
const mockReceipts = {
	early: mockRecord('early', '2026-09-07T10:00:00'),
	late: mockRecord('late', '2026-09-07T14:00:00'),
};
const mockPending = new Promise(() => {});
let mockSuspended: string | null = null;
let mockPhone = false;
let mockCurrent: ReturnType<typeof mockRecord> & { isNew?: boolean } = mockOpen[0].record;
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('../../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrderRecord: mockCurrent,
		openOrders: mockOpen,
		setCurrentOrderID: mockSetOrder,
	}),
}));
jest.mock('../../../hooks/use-engine-document', () => ({
	useEngineRecord: (_collection: string, uuid: keyof typeof mockReceipts) => {
		if (uuid === mockSuspended) throw mockPending;
		return mockReceipts[uuid];
	},
}));
jest.mock('observable-hooks', () => ({ useObservableSuspense: (record: unknown) => record }));
jest.mock('@wcpos/query', () => ({
	useRecordField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));
jest.mock('../../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ methods: [] }),
}));
jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { price_num_decimals: 2 } }),
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
jest.mock('@rn-primitives/slot', () => ({ Slot: () => null }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: () => null,
	TooltipTrigger: () => null,
	TooltipContent: () => null,
}));
jest.mock('../../checkout/payments/server/use-resume-terminal-legs', () => ({
	useResumeTerminalLegsForOrders: jest.fn(),
}));
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => mockPhone }));
jest.mock('./open-orders-list', () => ({ OpenOrdersList: () => null }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
		accessibilityLabel,
	}: {
		children: React.ReactNode;
		onPress: () => void;
		testID: string;
		accessibilityLabel?: string;
	}) => (
		<button data-testid={testID} onClick={onPress} aria-label={accessibilityLabel}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ onPress, testID }: { onPress: () => void; testID: string }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));
beforeEach(() => {
	mockSuspended = null;
	mockPhone = false;
	mockCurrent = mockOpen[0].record;
	resetCheckoutMode();
	jest.clearAllMocks();
});
it('shows a fresh cart as the active last tab, and only while the current order is new', () => {
	const { unmount } = render(<OpenOrderTabs />);
	expect(screen.queryByTestId('open-order-tab-new')).toBeNull();
	unmount();
	mockCurrent = {
		...mockRecord('fresh', '2026-09-07T15:00:00'),
		isNew: true,
		payload: { date_created_gmt: '2026-09-07T15:00:00', total: '0.00', refunds: [], meta_data: [] },
	};
	render(<OpenOrderTabs />);
	const fresh = screen.getByTestId('open-order-tab-new');
	const open = screen.getByTestId('open-order-tab-open');
	expect(fresh.getAttribute('aria-selected')).toBe('true');
	expect(fresh.className).toContain('border-primary');
	expect(open.className).toContain('border-transparent');
	expect(fresh.firstElementChild?.firstElementChild?.textContent).toBe('$0.00');
	expect(screen.getByTestId('open-order-status-fresh').textContent).toBe('Cart');
	// After the open orders, before the +; it is not an open order, so the count stays.
	expect(open.compareDocumentPosition(fresh) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(screen.getByTestId('open-orders-count').textContent).toBe('1');
	fireEvent.click(open);
	expect(mockSetOrder).toHaveBeenCalledWith('open');
});
it('appends receipt-only tabs after open orders, avoids duplicates, and selects each kind', () => {
	enterReceipt('late');
	enterReceipt('open');
	enterReceipt('early');
	render(<OpenOrderTabs />);
	expect(screen.getAllByTestId(/^open-order-tab-/).map((el) => el.dataset.testid)).toEqual([
		'open-order-tab-open',
		'open-order-tab-late',
		'open-order-tab-early',
	]);
	fireEvent.click(screen.getByTestId('open-order-tab-late'));
	expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBe('late');
	expect(screen.getByTestId('open-order-tab-late').getAttribute('aria-selected')).toBe('true');
	expect(mockSetOrder).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('open-order-tab-open'));
	expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBe('open');
	act(() => finishReceipt('open'));
	fireEvent.click(screen.getByTestId('open-order-tab-open'));
	expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBeNull();
	expect(mockSetOrder).toHaveBeenCalledWith('open');
	act(() => enterReceipt('early'));
	fireEvent.click(screen.getByTestId('new-order-tab'));
	expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBeNull();
	expect(mockSetOrder).toHaveBeenLastCalledWith('');
});

it('keeps other tabs reachable when a receipt suspends or is missing', () => {
	mockSuspended = 'early';
	enterReceipt('early');
	enterReceipt('missing');
	enterReceipt('late');
	render(<OpenOrderTabs />);
	// A suspended receipt keeps its trigger (the list indexes direct children by value) with
	// empty content; a missing one drops itself from the store and so from the strip.
	expect(screen.getByTestId('open-order-tab-early').textContent).toBe('');
	expect(screen.queryByTestId('open-order-tab-missing')).toBeNull();
	expect(screen.getByTestId('open-order-tab-open')).not.toBeNull();
	expect(screen.getByTestId('open-order-tab-late')).not.toBeNull();
	expect(screen.getByTestId('new-order-tab')).not.toBeNull();
});

it('marks selection with an underline and keeps an amount above the cart status', () => {
	enterReceipt('late');
	render(<OpenOrderTabs />);
	const active = screen.getByTestId('open-order-tab-late');
	const inactive = screen.getByTestId('open-order-tab-open');
	expect(active.className).toContain('border-primary');
	expect(active.className).toContain('border-b-2');
	expect(inactive.className).toContain('border-transparent');
	expect(inactive.className).toContain('border-b-2');
	const content = inactive.firstElementChild!;
	expect(content.className).toContain('items-start');
	expect(content.firstElementChild?.textContent).toBe('$10.00');
	expect(content.firstElementChild?.className).toContain('font-medium');
	expect(content.firstElementChild?.className).toContain('tabular-nums');
	// "Cart" is the fallback, not a status: plain muted text, no dot, on any tab.
	expect(content.lastElementChild?.textContent).toBe('Cart');
	expect(screen.getByTestId('open-order-status-open').textContent).toBe('Cart');
	expect(screen.queryByTestId('open-order-chip-open')).toBeNull();
	expect(active.firstElementChild?.firstElementChild?.className).toContain('font-semibold');
	expect(active.firstElementChild?.children).toHaveLength(2);
	// The active tab carries its status as text, never as a chip.
	expect(screen.queryByTestId('open-order-chip-late')).toBeNull();
	expect(screen.getByTestId('open-order-status-late')).toBeTruthy();
	expect(screen.getByTestId('open-orders-count').textContent).toBe('1');
	expect(screen.getByTestId('open-orders-count').getAttribute('aria-label')).toBe('1 open');
});

it('keeps phone tabs to an amount and a dot, with no active chip', () => {
	mockPhone = true;
	enterReceipt('late');
	render(<OpenOrderTabs />);
	const content = screen.getByTestId('open-order-tab-open').firstElementChild!;
	expect(content.className).toContain('flex-row');
	expect(content.textContent).toBe('$10.00');
	// A plain cart has no dot on the phone either; only a real status draws one.
	expect(screen.queryByTestId('open-order-chip-open')).toBeNull();
	expect(screen.queryByTestId('open-order-chip-late')).toBeNull();
});

it('keeps the shared title wording for callers outside the strip', () => {
	const order = mockOpen[0].record as unknown as React.ComponentProps<typeof CartTabTitle>['order'];
	const { container } = render(<CartTabTitle order={order} />);
	expect(container.textContent).toBe('Cart $10.00');
});
