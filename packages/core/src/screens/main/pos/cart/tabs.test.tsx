/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { type PaymentRow, withLedger } from '@wcpos/order-math';

import { OpenOrderTabs } from './tabs';
import {
	enterCheckout,
	enterReceipt,
	finishReceipt,
	getCheckoutModeSnapshot,
	markOrderSaveRejected,
	markOrderSaving,
	resetCheckoutMode,
} from '../checkout/checkout-mode';
import { CartTabTitle } from './tab-title';

// RN Web drops className without Uniwind's app transform; keep the supplied classes observable.
type LayoutEvent = {
	nativeEvent: { layout: { x: number; y: number; width: number; height: number } };
};
const mockScrollTo = jest.fn();
const mockScrollEvents = new Map<string, (() => void) | undefined>();
const mockContentSizes = new Map<string, (width: number, height: number) => void>();
let mockReducedMotion = false;
let mockAwaiting = new Set<string>();
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
				'aria-hidden'?: boolean;
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
				'aria-hidden': hidden,
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
					'aria-hidden': hidden,
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
		ScrollView: React.forwardRef(function ScrollHost(
			props: {
				children?: React.ReactNode;
				onContentSizeChange: (width: number, height: number) => void;
				onLayout: (event: LayoutEvent) => void;
				scrollEnabled: boolean;
				snapToOffsets?: number[];
				onScrollBeginDrag?: () => void;
				onScroll?: () => void;
				onMomentumScrollEnd?: () => void;
				keyboardShouldPersistTaps?: string;
				role?: string;
				'aria-owns'?: string;
			},
			ref
		) {
			React.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo }));
			mockContentSizes.set('row', props.onContentSizeChange);
			mockScrollEvents.set('drag', props.onScrollBeginDrag);
			mockScrollEvents.set('scroll', props.onScroll);
			mockScrollEvents.set('end', props.onMomentumScrollEnd);
			mockLayouts.set('scroll-row', props.onLayout);
			return (
				<div
					role={props.role}
					aria-owns={props['aria-owns']}
					data-testid="scroll-row"
					data-scroll={String(props.scrollEnabled)}
					data-keyboard-taps={props.keyboardShouldPersistTaps}
					data-snaps={JSON.stringify(props.snapToOffsets)}
				>
					{props.children}
				</div>
			);
		}),
	};
});
// Supply the layout events a real ScrollView gets; jsdom does not measure.
const measure = (id: string, width: number, x = 0) =>
	act(() => mockLayouts.get(id)?.({ nativeEvent: { layout: { x, y: 0, width, height: 52 } } }));
const layout = (width: number, widths = mockOpen.map(() => 100)) => {
	measure('open-order-strip', width);
	const ids = screen.getAllByRole('tab').filter((tab) => tab.dataset.testid !== 'new-order-tab');
	let x = 0;
	ids.forEach((tab, index) => {
		const w = widths[index] ?? 100;
		measure(tab.dataset.testid!, w, x);
		x += w;
	});
	act(() => mockContentSizes.get('row')?.(x, 52));
	measure(
		'scroll-row',
		width - (mockCurrent.isNew ? 112 : 48) - (screen.queryByTestId('open-orders-count') ? 56 : 0)
	);
};
const mockSetOrder = jest.fn();
const mockRecord = (uuid: string, date: string) => ({
	uuid,
	payload: {
		date_created_gmt: date,
		total: '10.00',
		refunds: [],
		meta_data: [] as ReturnType<typeof withLedger>,
		status: 'pos-open',
		billing: { first_name: '', last_name: '' },
		line_items: [{ product_id: 1, name: 'Hat' }],
		fee_lines: [],
		shipping_lines: [],
	},
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
	useReducedMotion: () => mockReducedMotion,
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
jest.mock('observable-hooks', () => ({
	...jest.requireActual('observable-hooks'),
	useObservableSuspense: (record: unknown) => record,
}));
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
jest.mock('./open-orders-list', () => ({
	AGE_TICK_MS: 60_000,
	STALE_AFTER_MS: 3_600_000,
	OpenOrdersList: ({
		onSelect,
		onClose,
	}: {
		onSelect: (id: string) => void;
		onClose: (id: string) => void;
	}) => (
		<button
			data-testid="list-pick"
			onClick={() => {
				onSelect('c');
				onClose('c');
			}}
		/>
	),
}));
jest.mock('../../../../hooks/use-local-date', () => ({
	convertUTCStringToLocalDate: (value: string) => new Date(`${value}Z`),
}));
jest.mock('../checkout/use-awaiting-store', () => ({
	useAwaitsStore: (uuid: string) => mockAwaiting.has(uuid),
	useAwaitingStore: () => mockAwaiting,
}));
jest.mock('@wcpos/components/slide-over', () => ({
	SlideOver: ({
		open,
		from,
		children,
	}: {
		open: boolean;
		from: string;
		children: React.ReactNode;
	}) => (
		<div data-testid="open-orders-cover" data-open={String(open)} data-from={from}>
			{children}
		</div>
	),
}));
beforeEach(() => {
	mockSuspended = null;
	mockPhone = false;
	mockReducedMotion = false;
	mockAwaiting = new Set();
	mockLayouts.clear();
	jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-07T12:05:00Z'));
	mockCurrent = mockOpen[0].record;
	resetCheckoutMode();
	jest.clearAllMocks();
});
const freshRecord = () => ({
	...mockRecord('fresh', '2026-09-07T15:00:00'),
	isNew: true,
	payload: { ...mockRecord('fresh', '2026-09-07T15:00:00').payload, total: '0.00', line_items: [] },
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
	expect(screen.getAllByTestId(/^open-order-tab-[^-]+$/)).toHaveLength(1);
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
		layout(560);
		expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 408, animated: true });
		expect(screen.getAllByTestId(/^open-order-tab-[^-]+$/)).toHaveLength(8);
		layout(273);
		expect(screen.getAllByTestId(/^open-order-tab-[^-]+$/)).toHaveLength(8);
		fireEvent.keyDown(screen.getByTestId('new-order-tab'), { key: 'ArrowLeft' });
		expect(mockSetOrder).toHaveBeenLastCalledWith('h');
		mockSetOrder.mockClear();
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
	expect(screen.getAllByTestId(/^open-order-tab-[^-]+$/).map((el) => el.dataset.testid)).toEqual([
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

it('marks selection with an underline and keeps who above age or status', () => {
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
	expect(content.firstElementChild?.textContent).toBe('Guest · Hat');
	expect(content.firstElementChild?.className).toContain('font-medium');
	// A token width, never an arbitrary px (the uniwind contract ratchet).
	expect(content.firstElementChild?.className).toContain('max-w-52');
	// A plain cart has an age instead of a status.
	expect(screen.getByTestId('open-order-tab-open-age').textContent).toBe('5 min');
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

it('keeps phone tabs to who and age or a dot, with no active chip', () => {
	mockPhone = true;
	enterReceipt('late');
	render(<OpenOrderTabs />);
	const content = screen.getByTestId('open-order-tab-open').firstElementChild!;
	expect(content.className).toContain('flex-row');
	expect(content.textContent).toBe('Guest · Hat5 min');
	// A plain cart has no dot on the phone either; only a real status draws one.
	expect(screen.queryByTestId('open-order-chip-open')).toBeNull();
	expect(screen.queryByTestId('open-order-chip-late')).toBeNull();
	act(() => enterCheckout('open'));
	expect(screen.getByTestId('open-order-chip-open').textContent).toBe('');
	expect(screen.queryByTestId('open-order-tab-open-age')).toBeNull();
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

it('centres selections, list picks and keyboard steps, clamping the first and last carts', () => {
	const open = mockOpen;
	try {
		mockOpen = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({
			id,
			record: mockRecord(id, '2026-09-07T12:00:00'),
		}));
		mockCurrent = mockOpen[4].record;
		const { rerender } = render(<OpenOrderTabs />);
		layout(560);
		expect(screen.getAllByTestId(/^open-order-tab-[^-]+$/)).toHaveLength(8);
		expect(screen.getByTestId('open-orders-count').textContent).toBe('8');
		// The first centring is the strip finding its place on mount: it lands, never slides.
		expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 222, animated: false });
		expect(screen.getByTestId('scroll-row').dataset.snaps).toBe('[0,22,122,222,322,344]');
		fireEvent.click(screen.getByTestId('open-order-tab-d'));
		expect(mockSetOrder).toHaveBeenLastCalledWith('d');
		mockCurrent = mockOpen[3].record;
		rerender(<OpenOrderTabs />);
		expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 122, animated: true });
		fireEvent.keyDown(screen.getByTestId('open-order-tab-d'), { key: 'ArrowRight' });
		expect(mockSetOrder).toHaveBeenLastCalledWith('e');
		mockCurrent = mockOpen[4].record;
		rerender(<OpenOrderTabs />);
		expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 222, animated: true });
		expect(document.activeElement).toBe(screen.getByTestId('open-order-tab-e'));
		fireEvent.click(screen.getByTestId('open-orders-count'));
		fireEvent.click(screen.getByTestId('list-pick'));
		expect(mockSetOrder).toHaveBeenLastCalledWith('c');
		mockCurrent = mockOpen[2].record;
		rerender(<OpenOrderTabs />);
		expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 22, animated: true });
		mockCurrent = mockOpen[0].record;
		rerender(<OpenOrderTabs />);
		expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 0, animated: true });
		mockCurrent = mockOpen[7].record;
		mockReducedMotion = true;
		rerender(<OpenOrderTabs />);
		expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 344, animated: false });
	} finally {
		mockOpen = open;
	}
});
it('left aligns fitting tabs without a tray or any scroll call', () => {
	render(<OpenOrderTabs />);
	layout(560);
	expect(screen.queryByTestId('open-orders-count')).toBeNull();
	expect(screen.getByTestId('scroll-row').dataset.scroll).toBe('false');
	expect(mockScrollTo).not.toHaveBeenCalled();
});
it('mounts only 25 carts either side of the open one, plus receipts', () => {
	const open = mockOpen;
	try {
		mockOpen = Array.from({ length: 1000 }, (_, i) => ({
			id: `c${i}`,
			record: mockRecord(`c${i}`, '2026-09-07T12:00:00'),
		}));
		mockCurrent = mockOpen[500].record;
		enterReceipt('late', { select: false });
		const { rerender } = render(<OpenOrderTabs />);
		expect(screen.getAllByTestId(/^open-order-tab-[^-]+$/)).toHaveLength(52);
		expect(screen.getByTestId('open-order-tab-c475')).toBeTruthy();
		expect(screen.getByTestId('open-order-tab-c525')).toBeTruthy();
		expect(screen.queryByTestId('open-order-tab-c474')).toBeNull();
		expect(screen.getByTestId('open-order-tab-late')).toBeTruthy();
		mockCurrent = mockOpen[900].record;
		rerender(<OpenOrderTabs />);
		expect(screen.getByTestId('open-order-tab-c900')).toBeTruthy();
		expect(screen.queryByTestId('open-order-tab-c500')).toBeNull();
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

it('shows billing names and guest entry counts, stale ages, and no age on restart', () => {
	const original = mockOpen[0].record;
	try {
		const { rerender } = render(<OpenOrderTabs />);
		mockOpen[0].record = {
			...original,
			payload: {
				...original.payload,
				billing: { first_name: 'Ada', last_name: 'Lovelace' },
				date_created_gmt: '2026-09-07T10:00:00',
			},
		};
		rerender(<OpenOrderTabs />);
		expect(screen.getByTestId('open-order-tab-open-who').textContent).toBe('Ada Lovelace');
		expect(screen.getByTestId('open-order-tab-open-age').className).toContain('text-warning-text');
		expect(screen.getByTestId('open-order-tab-open-age').className).toContain('font-semibold');
		mockOpen[0].record = {
			...original,
			payload: {
				...original.payload,
				line_items: [...original.payload.line_items, { product_id: 2, name: 'Shirt' }],
			},
		};
		rerender(<OpenOrderTabs />);
		expect(screen.getByTestId('open-order-tab-open-who').textContent).toBe('Guest · 2 items');
		act(() => enterCheckout('open'));
		expect(screen.queryByTestId('open-order-tab-open-age')).toBeNull();
		expect(screen.getByTestId('open-order-status-open').textContent).toBe('In checkout');
		act(() => resetCheckoutMode());
		mockOpen[0].record = { ...original, payload: { ...original.payload, line_items: [] } };
		rerender(<OpenOrderTabs />);
		expect(screen.getByTestId('open-order-tab-open-who').textContent).toBe('Guest');
		expect(screen.queryByTestId('open-order-tab-open-age')).toBeNull();
	} finally {
		mockOpen[0].record = original;
	}
});
it('summarises clipped carts with one dot per exception tone, excluding the open cart', () => {
	const open = mockOpen;
	try {
		mockOpen = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({
			id,
			record: mockRecord(id, '2026-09-07T12:00:00'),
		}));
		mockCurrent = mockOpen[0].record;
		mockAwaiting.add('h');
		mockOpen[6].record.payload.meta_data = withLedger(
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
		);
		markOrderSaveRejected('f', { status: null, reason: null, message: null });
		const { rerender } = render(<OpenOrderTabs />);
		layout(560);
		expect(screen.getAllByTestId('open-orders-warning')).toHaveLength(1);
		expect(screen.getAllByTestId('open-orders-error')).toHaveLength(1);
		expect(screen.getByTestId('open-orders-count').getAttribute('aria-label')).toBe(
			'8 open, Awaiting store, Save refused'
		);
		for (const tone of ['warning', 'error']) {
			const dot = screen.getByTestId(`open-orders-${tone}`);
			expect(dot.getAttribute('aria-label')).toBeNull();
			expect(dot.getAttribute('aria-hidden')).toBe('true');
		}
		mockAwaiting.clear();
		mockOpen[6].record.payload.meta_data = [];
		mockCurrent = mockOpen[5].record;
		rerender(<OpenOrderTabs />);
		expect(screen.queryByTestId('open-orders-warning')).toBeNull();
		expect(screen.queryByTestId('open-orders-error')).toBeNull();
		mockAwaiting.add('f');
		act(() => resetCheckoutMode());
		expect(screen.queryByTestId('open-orders-warning')).toBeNull();
		mockCurrent = mockOpen[0].record;
		mockOpen = mockOpen.filter(({ id }) => id !== 'f');
		rerender(<OpenOrderTabs />);
		expect(screen.queryByTestId('open-orders-error')).toBeNull();
	} finally {
		mockOpen = open;
	}
});

it('uses measured text widths and recentres when the row or active tab changes size', () => {
	const open = mockOpen;
	try {
		mockOpen = ['a', 'b', 'c', 'd'].map((id) => ({
			id,
			record: mockRecord(id, '2026-09-07T12:00:00'),
		}));
		mockCurrent = mockOpen[2].record;
		render(<OpenOrderTabs />);
		// No viewport yet: an early content-size event cannot scroll a hidden strip.
		act(() => mockContentSizes.get('row')?.(740, 52));
		expect(mockScrollTo).not.toHaveBeenCalled();
		layout(560, [100, 200, 240, 200]);
		// The first centring is the strip finding its place on mount: it lands, never slides.
		expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 192, animated: false });
		measure('scroll-row', 400);
		expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 220, animated: true });
		measure('open-order-tab-c', 280, 300);
		act(() => mockContentSizes.get('row')?.(780, 52));
		expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 240, animated: true });
	} finally {
		mockOpen = open;
	}
});
it('shares one age clock across the strip and updates it while mounted', () => {
	jest.useFakeTimers({ now: new Date('2026-09-07T12:05:00Z') });
	const interval = jest.spyOn(global, 'setInterval');
	try {
		const { unmount } = render(<OpenOrderTabs />);
		expect(interval).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('open-order-tab-open-age').textContent).toBe('5 min');
		jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-07T12:06:00Z'));
		act(() => jest.advanceTimersByTime(60_000));
		expect(screen.getByTestId('open-order-tab-open-age').textContent).toBe('6 min');
		unmount();
	} finally {
		interval.mockRestore();
		jest.useRealTimers();
	}
});

// A width-only web layout must not retain an x from before a sibling left.
it('recentres the open cart after a cart to its left closes without remeasurement', () => {
	const open = mockOpen;
	try {
		mockOpen = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({
			id,
			record: mockRecord(id, '2026-09-07T12:00:00'),
		}));
		mockCurrent = mockOpen[4].record;
		const { rerender } = render(<OpenOrderTabs />);
		layout(560);
		expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 222, animated: false });
		mockOpen = mockOpen.slice(1);
		rerender(<OpenOrderTabs />);
		act(() => mockContentSizes.get('row')?.(700, 52));
		expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 122, animated: true });
	} finally {
		mockOpen = open;
	}
});
it.each(['drag', 'scroll'])(
	'keeps a user %s still across size changes until another tab is selected',
	(event) => {
		jest.useFakeTimers();
		const open = mockOpen;
		try {
			mockOpen = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({
				id,
				record: mockRecord(id, '2026-09-07T12:00:00'),
			}));
			mockCurrent = mockOpen[4].record;
			const { rerender } = render(<OpenOrderTabs />);
			layout(560);
			// A scroll emitted by our own scrollTo must not count as a cashier's swipe.
			act(() => mockScrollEvents.get('scroll')?.());
			act(() => jest.advanceTimersByTime(1000));
			act(() => mockContentSizes.get('row')?.(810, 52));
			expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 222, animated: true });
			act(() => jest.advanceTimersByTime(1000));
			act(() => mockScrollEvents.get(event)?.());
			mockScrollTo.mockClear();
			act(() => mockContentSizes.get('row')?.(820, 52));
			measure('scroll-row', 400);
			expect(mockScrollTo).not.toHaveBeenCalled();
			fireEvent.click(screen.getByTestId('open-order-tab-d'));
			mockCurrent = mockOpen[3].record;
			rerender(<OpenOrderTabs />);
			expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 150, animated: true });
			act(() => mockScrollEvents.get('drag')?.());
			mockScrollTo.mockClear();
			fireEvent.keyDown(screen.getByTestId('open-order-tab-d'), { key: 'ArrowRight' });
			mockCurrent = mockOpen[4].record;
			rerender(<OpenOrderTabs />);
			expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 250, animated: true });
		} finally {
			mockOpen = open;
			jest.useRealTimers();
		}
	}
);
it('keeps the active phone age only when there is no chip state', () => {
	mockPhone = true;
	render(<OpenOrderTabs />);
	expect(screen.getByTestId('open-order-tab-open-age').textContent).toBe('5 min');
	act(() => enterCheckout('open'));
	expect(screen.queryByTestId('open-order-tab-open-age')).toBeNull();
	expect(screen.queryByTestId('open-order-chip-open')).toBeNull();
	expect(screen.queryByTestId('open-order-status-open')).toBeNull();
});
it.each(['rejected', 'awaiting', 'terminal'])(
	'summarises the unmounted 30th cart when %s',
	(state) => {
		const open = mockOpen;
		try {
			mockOpen = Array.from({ length: 30 }, (_, i) => ({
				id: `c${i}`,
				record: mockRecord(`c${i}`, '2026-09-07T12:00:00'),
			}));
			mockCurrent = mockOpen[0].record;
			if (state === 'rejected')
				markOrderSaveRejected('c29', { status: null, reason: null, message: null });
			if (state === 'awaiting') mockAwaiting.add('c29');
			if (state === 'terminal')
				mockOpen[29].record.payload.meta_data = withLedger(
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
				);
			const { rerender } = render(<OpenOrderTabs />);
			layout(560);
			expect(screen.queryByTestId('open-order-tab-c29')).toBeNull();
			expect(
				screen.getByTestId(`open-orders-${state === 'rejected' ? 'error' : 'warning'}`)
			).toBeTruthy();
			mockCurrent = mockOpen[29].record;
			rerender(<OpenOrderTabs />);
			expect(screen.queryByTestId('open-orders-error')).toBeNull();
			expect(screen.queryByTestId('open-orders-warning')).toBeNull();
		} finally {
			mockOpen = open;
		}
	}
);
it('lets tab presses reach the tab while the native search keyboard is open', () => {
	render(<OpenOrderTabs />);
	expect(screen.getByTestId('scroll-row').dataset.keyboardTaps).toBe('handled');
});
