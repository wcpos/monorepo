/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { OpenOrderTabs } from './tabs';
import {
	enterCheckout,
	enterReceipt,
	finishReceipt,
	getCheckoutModeSnapshot,
	markOrderSaving,
	resetCheckoutMode,
} from '../checkout/checkout-mode';
import { CartTabTitle } from './tab-title';

// RN Web drops className without Uniwind's app transform; keep the supplied classes observable.
type LayoutEvent = {
	nativeEvent: { layout: { x: number; y: number; width: number; height: number } };
};
const mockLayouts = new Map<string, (event: LayoutEvent) => void>();
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
				onLayout?: (event: LayoutEvent) => void;
				onKeyDown?: (event: {
					nativeEvent: { key: string };
					target: EventTarget;
					defaultPrevented: boolean;
					preventDefault: () => void;
				}) => void;
				role?: string;
				accessibilityLabel?: string;
				'aria-selected'?: boolean;
				'aria-expanded'?: boolean;
				'aria-owns'?: string;
				nativeID?: string;
				style?: React.CSSProperties;
			}
		>(function Host(
			{
				children,
				className,
				testID,
				onPress,
				onLayout,
				onKeyDown,
				role,
				accessibilityLabel,
				'aria-selected': selected,
				'aria-expanded': expanded,
				'aria-owns': owns,
				nativeID,
				style,
			},
			ref
		) {
			if (testID && onLayout) mockLayouts.set(testID, onLayout);
			return React.createElement(
				tag,
				{
					ref,
					className,
					'data-testid': testID,
					onClick: onPress,
					onKeyDown: onKeyDown
						? (event: React.KeyboardEvent) =>
								onKeyDown({
									nativeEvent: { key: event.key },
									target: event.target,
									defaultPrevented: event.defaultPrevented,
									preventDefault: () => event.preventDefault(),
								})
						: undefined,
					role,
					'aria-label': accessibilityLabel,
					'aria-selected': selected,
					'aria-expanded': expanded,
					'aria-owns': owns,
					id: nativeID,
					style,
				},
				children
			);
		});
	return {
		...actual,
		Platform: { ...actual.Platform, OS: 'web' },
		View: host('div'),
		Pressable: host('button'),
		Text: host('span'),
	};
});
// The strip lays itself out from its measured width; jsdom measures nothing, so a test
// hands it one. 200 is too narrow for two tabs; 100 is too narrow for one.
const layout = (width: number) =>
	act(() =>
		mockLayouts.get('open-order-strip')?.({
			nativeEvent: { layout: { x: 0, y: 0, width, height: 52 } },
		})
	);
const mockSetOrder = jest.fn();
const mockRecord = (uuid: string, date: string) => ({
	uuid,
	payload: { date_created_gmt: date, total: '10.00', refunds: [], meta_data: [] },
});
let mockOpen = [{ id: 'open', record: mockRecord('open', '2026-09-07T12:00:00') }];
const mockTimings: number[] = [];
// The count badge's beat, observed: the inert mock from jest.config says nothing about motion.
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: jest.requireActual('react-native').View },
	LinearTransition: {
		duration: () => ({ easing: () => ({ reduceMotion: () => 'layout' }) }),
	},
	ReduceMotion: { System: 'system' },
	Easing: { bezier: () => 'ease', linear: 'linear' },
	Extrapolation: { CLAMP: 'clamp' },
	interpolate: (value: number) => value,
	useAnimatedStyle: () => ({}),
	useSharedValue: (value: number) => jest.requireActual('react').useRef({ value }).current,
	withSequence: (...steps: number[]) => steps.at(-1),
	withSpring: (value: number) => value,
	withTiming: (value: number, config: { duration: number }) => {
		mockTimings.push(config.duration);
		return value;
	},
}));
const mockReceipts = {
	early: mockRecord('early', '2026-09-07T10:00:00'),
	late: mockRecord('late', '2026-09-07T14:00:00'),
};
const mockPending = new Promise(() => {});
let mockSuspended: string | null = null;
let mockPhone = false;
let mockScope = '7:2:r1';
let mockCurrent: ReturnType<typeof mockRecord> & { isNew?: boolean } = mockOpen[0].record;
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrderRecord: mockCurrent,
		openOrders: mockOpen,
		openOrdersScope: mockScope,
		setCurrentOrderID: mockSetOrder,
	}),
}));
jest.mock('@wcpos/query/record-readers', () => ({
	useEngineRecord: (_collection: string, uuid: keyof typeof mockReceipts) => {
		if (uuid === mockSuspended) throw mockPending;
		return mockReceipts[uuid];
	},
}));
jest.mock('observable-hooks', () => ({ useObservableSuspense: (record: unknown) => record }));
jest.mock('@wcpos/query', () => ({
	OPEN_ORDER_STATUSES: ['pos-open', 'pos-partial', 'pending'],
	useRecordField: <T,>(source: T, select: (value: T) => unknown) => select(source),
	useDocField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));
jest.mock('../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ methods: [] }),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { price_num_decimals: 2 } }),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('@rn-primitives/slot', () => ({ Slot: () => null }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: () => null,
	TooltipTrigger: () => null,
	TooltipContent: () => null,
}));
jest.mock('../checkout/payments/server/use-resume-terminal-legs', () => ({
	useResumeTerminalLegsForOrders: jest.fn(),
}));
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => mockPhone }));
jest.mock('./open-orders-list', () => ({ OpenOrdersList: () => null }));
jest.mock('@wcpos/components/slide-over', () => ({
	SlideOver: ({ open, from }: { open: boolean; from: string }) => (
		<div data-testid="open-orders-cover" data-open={String(open)} data-from={from} />
	),
}));
beforeEach(() => {
	mockSuspended = null;
	mockPhone = false;
	mockCurrent = mockOpen[0].record;
	resetCheckoutMode();
	jest.clearAllMocks();
});
const freshRecord = () => ({
	...mockRecord('fresh', '2026-09-07T15:00:00'),
	isNew: true,
	payload: { date_created_gmt: '2026-09-07T15:00:00', total: '0.00', refunds: [], meta_data: [] },
});
it("the + cell is the blank cart's tab: it unfolds while the current order is new, folds on leaving", () => {
	// On a cart: the + is a folded 48 pt button, no cart tab for the blank cart.
	const { unmount } = render(<OpenOrderTabs />);
	expect(screen.queryByTestId('open-order-tab-new')).toBeNull();
	const plus = screen.getByTestId('new-order-tab');
	expect(plus.getAttribute('aria-selected')).toBe('false');
	expect(plus.style.width).toBe('48px');
	expect(screen.queryByTestId('new-order-tab-label')).toBeNull();
	fireEvent.click(plus);
	expect(mockSetOrder).toHaveBeenCalledWith('');
	unmount();
	// On the blank cart: the same cell is the selected "+ New" tab; the open cart's tab is
	// not selected; the row still holds exactly the open carts (nothing was added).
	mockCurrent = freshRecord();
	render(<OpenOrderTabs />);
	layout(560);
	const fresh = screen.getByTestId('new-order-tab');
	const open = screen.getByTestId('open-order-tab-open');
	expect(fresh.getAttribute('aria-selected')).toBe('true');
	expect(fresh.style.width).toBe('112px');
	expect(fresh.className).toContain('border-primary');
	expect(screen.getByTestId('new-order-tab-label').textContent).toBe('New');
	// The tablist owns the cell, so the selected New tab is one of its tabs to a reader.
	expect(screen.getByRole('tablist').getAttribute('aria-owns')).toBe(fresh.id);
	expect(open.className).toContain('border-transparent');
	expect(screen.getAllByTestId(/^open-order-tab-/)).toHaveLength(1);
	expect(screen.queryByTestId('open-orders-count')).toBeNull();
	// + while already on the blank cart is a place, not an action.
	mockSetOrder.mockClear();
	fireEvent.click(fresh);
	expect(mockSetOrder).not.toHaveBeenCalled();
	// A step left from the blank cart lands on the last cart: the key fires on the New cell
	// itself and reaches the strip's handler.
	fireEvent.keyDown(fresh, { key: 'ArrowLeft' });
	expect(mockSetOrder).toHaveBeenLastCalledWith('open');
	fireEvent.click(open);
	expect(mockSetOrder).toHaveBeenLastCalledWith('open');
});
it('with no carts the unfolded New tab is the only tab: no underline, no tray, no arrows', () => {
	const open = mockOpen;
	try {
		mockOpen = [];
		mockCurrent = freshRecord();
		render(<OpenOrderTabs />);
		layout(560);
		const fresh = screen.getByTestId('new-order-tab');
		expect(fresh.getAttribute('aria-selected')).toBe('true');
		expect(fresh.className).toContain('border-transparent');
		expect(fresh.className).not.toContain('border-primary');
		expect(screen.queryByTestId('open-orders-count')).toBeNull();
		expect(screen.queryByTestId('scrollable-tabs-prev')).toBeNull();
	} finally {
		mockOpen = open;
	}
});
it('a step right from the last cart lands on the blank cart, and the row keeps the last carts beside it', () => {
	const open = mockOpen;
	try {
		mockOpen = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, index) => ({
			id,
			record: mockRecord(id, `2026-09-07T1${index}:00:00`),
		}));
		mockCurrent = mockOpen[7].record;
		const { rerender } = render(<OpenOrderTabs />);
		layout(560);
		fireEvent.keyDown(screen.getByTestId('open-order-tab-h'), { key: 'ArrowRight' });
		expect(mockSetOrder).toHaveBeenLastCalledWith('');
		mockCurrent = freshRecord();
		rerender(<OpenOrderTabs />);
		// The step's focus settles on the New cell once it is the open tab.
		expect(document.activeElement).toBe(screen.getByTestId('new-order-tab'));
		// The New tab is wider than the folded +, so one less cart fits; the window ends at h.
		const shown = screen.getAllByTestId(/^open-order-tab-/).map((el) => el.dataset.testid);
		expect(shown[shown.length - 1]).toBe('open-order-tab-h');
		expect(screen.queryByTestId('scrollable-tabs-next')).toBeNull();
		expect(screen.getByTestId('scrollable-tabs-prev')).not.toBeNull();
		expect(screen.getByTestId('open-orders-count').textContent).toBe('8');
		// Too narrow for even one whole cart beside the tray, the arrow and the New tab: the
		// row shows no cart rather than a cut one; the arrow still steps back to h.
		layout(273);
		expect(screen.queryAllByTestId(/^open-order-tab-/)).toHaveLength(0);
		fireEvent.click(screen.getByTestId('scrollable-tabs-prev'));
		expect(mockSetOrder).toHaveBeenLastCalledWith('h');
		// An arrow key on a strip BUTTON (the tray, an arrow) is not a step.
		mockSetOrder.mockClear();
		fireEvent.keyDown(screen.getByTestId('scrollable-tabs-prev'), { key: 'ArrowLeft' });
		fireEvent.keyDown(screen.getByTestId('open-orders-count'), { key: 'ArrowRight' });
		expect(mockSetOrder).not.toHaveBeenCalled();
	} finally {
		mockOpen = open;
	}
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
	layout(200);
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

it('opens the list from the strip, and the count button or a tab closes it again', () => {
	const { unmount } = render(<OpenOrderTabs position="top" />);
	expect(screen.getByTestId('open-orders-cover').dataset.from).toBe('top');
	unmount();
	render(<OpenOrderTabs />);
	layout(100);
	const cover = () => screen.getByTestId('open-orders-cover').dataset;
	// The strip sits under the cart by default, so the list rises out of its top edge.
	expect(cover()).toMatchObject({ open: 'false', from: 'bottom' });
	fireEvent.click(screen.getByTestId('open-orders-count'));
	expect(cover().open).toBe('true');
	fireEvent.click(screen.getByTestId('open-orders-count'));
	expect(cover().open).toBe('false');
	fireEvent.click(screen.getByTestId('open-orders-count'));
	fireEvent.click(screen.getByTestId('open-order-tab-open'));
	expect(cover().open).toBe('false');
	// The new-order button stays pressable beside the open list and must close it too.
	fireEvent.click(screen.getByTestId('open-orders-count'));
	fireEvent.click(screen.getByTestId('new-order-tab'));
	expect(cover().open).toBe('false');
});

it('tells the cart column when the list covers it, and when the strip goes away', () => {
	const onCoverChange = jest.fn();
	const { unmount } = render(<OpenOrderTabs onCoverChange={onCoverChange} />);
	layout(100);
	// Nothing is covered on mount, and the host is told in the press itself.
	expect(onCoverChange).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('open-orders-count'));
	expect(onCoverChange).toHaveBeenLastCalledWith(true);
	fireEvent.click(screen.getByTestId('open-order-tab-open'));
	expect(onCoverChange).toHaveBeenLastCalledWith(false);
	fireEvent.click(screen.getByTestId('open-orders-count'));
	unmount();
	expect(onCoverChange).toHaveBeenLastCalledWith(false);
});

it('the count badge beats for a new open order, not for another scope arriving', () => {
	const open = mockOpen;
	try {
		const { rerender } = render(<OpenOrderTabs />);
		layout(100);
		mockTimings.length = 0;
		// Another store, register or cashier: a different count, not a changed one.
		mockScope = '7:3:r2';
		mockOpen = [...open, { id: 'theirs', record: mockRecord('theirs', '2026-09-07T13:00:00') }];
		rerender(<OpenOrderTabs />);
		expect(mockTimings).toHaveLength(0);
		mockOpen = [...mockOpen, { id: 'more', record: mockRecord('more', '2026-09-07T13:30:00') }];
		rerender(<OpenOrderTabs />);
		expect(mockTimings.length).toBeGreaterThan(0);
	} finally {
		mockOpen = open;
		mockScope = '7:2:r1';
	}
});

it('a sole cart has no tray, no arrows and no underline', () => {
	render(<OpenOrderTabs />);
	layout(560);
	expect(screen.queryByTestId('open-orders-count')).toBeNull();
	expect(screen.queryByTestId('scrollable-tabs-prev')).toBeNull();
	expect(screen.queryByTestId('scrollable-tabs-next')).toBeNull();
	const tab = screen.getByTestId('open-order-tab-open');
	expect(tab.getAttribute('aria-selected')).toBe('true');
	expect(tab.className).toContain('border-transparent');
	expect(tab.className).not.toContain('border-primary');
	expect(screen.getByTestId('new-order-tab')).not.toBeNull();
});

it('overflow shows whole columns around the open cart, and the arrows step to a neighbour', () => {
	const open = mockOpen;
	try {
		mockOpen = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, index) => ({
			id,
			record: mockRecord(id, `2026-09-07T1${index}:00:00`),
		}));
		mockCurrent = mockOpen[4].record;
		const { rerender } = render(<OpenOrderTabs />);
		layout(560);
		// Three whole tabs fit beside the tray and two arrows; they grow out from e, right
		// first. The others are hidden, not cut.
		expect(screen.getAllByTestId(/^open-order-tab-/).map((el) => el.dataset.testid)).toEqual([
			'open-order-tab-d',
			'open-order-tab-e',
			'open-order-tab-f',
		]);
		expect(screen.getByTestId('open-orders-count').textContent).toBe('8');
		fireEvent.click(screen.getByTestId('scrollable-tabs-next'));
		expect(mockSetOrder).toHaveBeenLastCalledWith('f');
		fireEvent.click(screen.getByTestId('scrollable-tabs-prev'));
		expect(mockSetOrder).toHaveBeenLastCalledWith('d');
		fireEvent.keyDown(screen.getByTestId('open-order-tab-e'), { key: 'ArrowRight' });
		expect(mockSetOrder).toHaveBeenLastCalledWith('f');
		// The selection lands and the window moves: the new open tab takes the focus a step
		// asked for, even though it was not on the row when the key was pressed.
		mockCurrent = mockOpen[7].record;
		rerender(<OpenOrderTabs />);
		expect(document.activeElement).toBe(screen.getByTestId('open-order-tab-h'));
	} finally {
		mockOpen = open;
	}
});

it('the first cart pins to the left edge with only the right arrow', () => {
	const open = mockOpen;
	try {
		mockOpen = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, index) => ({
			id,
			record: mockRecord(id, `2026-09-07T1${index}:00:00`),
		}));
		mockCurrent = mockOpen[0].record;
		render(<OpenOrderTabs />);
		layout(560);
		expect(screen.queryByTestId('scrollable-tabs-prev')).toBeNull();
		expect(screen.getByTestId('scrollable-tabs-next')).not.toBeNull();
		expect(screen.getByTestId('open-order-tab-a').getAttribute('aria-selected')).toBe('true');
	} finally {
		mockOpen = open;
	}
});

it('keeps a paid checkout member tab before confirmation', () => {
	enterCheckout('late');
	const record = mockReceipts.late;
	mockReceipts.late = {
		...record,
		payload: { ...record.payload, status: 'completed' },
	} as typeof record;
	try {
		render(<OpenOrderTabs />);
		expect(screen.getByTestId('open-order-tab-late').textContent).toContain('Paid · receipt');
		// Tapping it before confirmation selects the receipt, never the draft under its name.
		fireEvent.click(screen.getByTestId('open-order-tab-late'));
		expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBe('late');
		expect(mockSetOrder).not.toHaveBeenCalledWith('late');
	} finally {
		mockReceipts.late = record;
	}
});
it('does not show a tab for a cancelled checkout member outside the open hits', () => {
	enterCheckout('late');
	const record = mockReceipts.late;
	mockReceipts.late = {
		...record,
		payload: { ...record.payload, status: 'cancelled' },
	} as typeof record;
	try {
		render(<OpenOrderTabs />);
		expect(screen.queryByTestId('open-order-tab-late')).toBeNull();
		expect(getCheckoutModeSnapshot().checkoutOrders.has('late')).toBe(false);
	} finally {
		mockReceipts.late = record;
	}
});

it('a draft saving into checkout has no tab until its record lands', () => {
	enterCheckout('draft-1');
	markOrderSaving('draft-1');
	render(<OpenOrderTabs />);
	expect(screen.queryByTestId('open-order-tab-draft-1')).toBeNull();
	expect(getCheckoutModeSnapshot().checkoutOrders.has('draft-1')).toBe(true);
});
it('a change of scope ends every unconfirmed checkout and keeps confirmed receipts', () => {
	// Another register's open order, still a checkout member: outside the hits, status open.
	enterCheckout('late');
	enterReceipt('early', { select: false });
	const record = mockReceipts.late;
	mockReceipts.late = {
		...record,
		payload: { ...record.payload, status: 'pos-open' },
	} as typeof record;
	try {
		const view = render(<OpenOrderTabs />);
		expect(getCheckoutModeSnapshot().checkoutOrders.has('late')).toBe(true);
		mockScope = '9:2:r1';
		view.rerender(<OpenOrderTabs />);
		expect(getCheckoutModeSnapshot().checkoutOrders.has('late')).toBe(false);
		expect(getCheckoutModeSnapshot().receiptOrders.has('early')).toBe(true);
		// No blank, selectable tab is left for the order that is no longer this till's.
		expect(screen.queryByTestId('open-order-tab-late')).toBeNull();
	} finally {
		mockReceipts.late = record;
		mockScope = '7:2:r1';
	}
});
