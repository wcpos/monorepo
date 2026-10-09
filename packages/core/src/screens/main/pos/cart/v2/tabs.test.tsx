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
					defaultPrevented: boolean;
					preventDefault: () => void;
				}) => void;
				role?: string;
				accessibilityLabel?: string;
				'aria-selected'?: boolean;
				'aria-expanded'?: boolean;
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
									defaultPrevented: event.defaultPrevented,
									preventDefault: () => event.preventDefault(),
								})
						: undefined,
					role,
					'aria-label': accessibilityLabel,
					'aria-selected': selected,
					'aria-expanded': expanded,
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
jest.mock('../../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrderRecord: mockCurrent,
		openOrders: mockOpen,
		openOrdersScope: mockScope,
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
	fireEvent.click(open);
	expect(mockSetOrder).toHaveBeenCalledWith('open');
	// Too narrow for both: the tray appears with the open-order count (the fresh cart is not
	// one), the fresh cart keeps its column, and the arrow steps to the hidden one.
	layout(200);
	expect(screen.getByTestId('open-orders-count').textContent).toBe('1');
	expect(screen.queryByTestId('open-order-tab-open')).toBeNull();
	expect(screen.queryByTestId('scrollable-tabs-next')).toBeNull();
	fireEvent.click(screen.getByTestId('scrollable-tabs-prev'));
	expect(mockSetOrder).toHaveBeenLastCalledWith('open');
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
		fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
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
