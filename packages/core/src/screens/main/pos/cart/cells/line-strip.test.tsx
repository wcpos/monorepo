/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { LineStrip, onStage } from './line-strip';
import { createOpenLine, type OpenLine } from '../open-line';
import { StripEdgeContext } from './strip-clear';

let mockPointer = 'coarse';
const mockRemoveLineItem = jest.fn().mockResolvedValue(undefined);
const mockOffsetSet = jest.fn();
const mockHaptic = jest.fn();
let mockStart: () => void;
let mockUpdate: (event: { translationX: number }) => void;
let mockFinalize: (event: { translationX: number; velocityX: number }, success: boolean) => void;
let mockTotalProps: {
	onHoverIn?: () => void;
	onHoverOut?: () => void;
	className?: string;
};
const mockLayouts: Record<string, (event: { nativeEvent: { layout: { width: number } } }) => void> =
	{};
const mockDisabled: unknown[] = [];
let mockRowClasses: string | undefined;
const mockButtonProps: Record<string, { variant?: string; className?: string }> = {};

jest.mock('@wcpos/components/lib/device', () => ({ usePointer: () => mockPointer }));
jest.mock('@wcpos/components/lib/haptics', () => ({ hapticTick: () => mockHaptic() }));
jest.mock('@wcpos/components/lib/motion', () => ({
	EASE: 'ease',
	EASE_EXIT: 'exit',
	PANEL_SLIDE_OUT: 200,
}));
jest.mock('../../hooks/use-remove-line-item', () => ({
	useRemoveLineItem: () => ({ removeLineItem: mockRemoveLineItem }),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('./edit-cart-item-button', () => ({
	EditCartItemButton: ({ tabIndex }: { tabIndex?: number }) => (
		<button role="button" data-testid="cart-line-edit" tabIndex={tabIndex} />
	),
}));
jest.mock('./edit-line-item/form', () => ({ EditLineItemForm: () => null }));
jest.mock('./edit-fee-line/form', () => ({ EditFeeLineForm: () => null }));
jest.mock('./edit-shipping-line/form', () => ({ EditShippingLineForm: () => null }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
		disabled,
		variant,
		className,
		tabIndex,
	}: React.PropsWithChildren<{
		tabIndex?: number;
		testID: string;
		onPress: () => void;
		disabled?: boolean;
		variant?: string;
		className?: string;
	}>) => {
		mockDisabled.push(disabled);
		mockButtonProps[testID] = { variant, className };
		return (
			<button role="button" data-testid={testID} onClick={onPress} tabIndex={tabIndex}>
				{children}
			</button>
		);
	},
	ButtonText: ({ children, className }: React.PropsWithChildren<{ className?: string }>) => (
		<span data-classes={className}>{children}</span>
	),
}));
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		// Not a component to the compiler lint: the mock only records each slot's layout handler.
		View: (props: React.ComponentProps<typeof actual.View>) => {
			if (props.onLayout && props.testID) mockLayouts[props.testID] = props.onLayout;
			if (props.testID === 'cart-line-row') mockRowClasses = props.className;
			return <actual.View {...props} />;
		},
		Pressable: (props: React.ComponentProps<typeof actual.Pressable>) => {
			if (props.testID === 'cart-line-total') mockTotalProps = props;
			return <actual.Pressable {...props} />;
		},
	};
});
jest.mock('react-native-reanimated', () => {
	const actual = jest.requireActual('react-native');
	return {
		__esModule: true,
		default: {
			// react-native-web consumes `className`; the slots' classes are mirrored to `data-classes` so a
			// test can read what a slot paints (the Edit slot's primary).
			View: (props: React.ComponentProps<typeof actual.View> & { className?: string }) => {
				if (props.onLayout && props.testID) mockLayouts[props.testID] = props.onLayout;
				return (
					<actual.View {...props} dataSet={{ ...props.dataSet, classes: props.className ?? '' }} />
				);
			},
		},
		useReducedMotion: () => true,
		useAnimatedStyle: () => ({}),
		useSharedValue: (initial: unknown) => {
			const React = jest.requireActual<typeof import('react')>('react');
			return React.useMemo(
				() => ({
					currentValue: initial,
					get value() {
						return this.currentValue;
					},
					set value(value: unknown) {
						this.currentValue = value;
						mockOffsetSet(value);
					},
					get() {
						return this.value;
					},
					set(value: unknown) {
						this.value = value;
					},
				}),
				[initial]
			);
		},
		withSpring: (value: number) => value,
		withTiming: (value: number) => value,
		withDelay: (_delay: number, value: number) => value,
	};
});
jest.mock('react-native-worklets', () => ({
	scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));
jest.mock('react-native-gesture-handler', () => ({
	Gesture: {
		Pan: () => {
			const pan = {
				runOnJS: () => pan,
				activeOffsetX: () => pan,
				failOffsetY: () => pan,
				onStart: (callback: typeof mockStart) => {
					mockStart = callback;
					return pan;
				},
				onUpdate: (callback: typeof mockUpdate) => {
					mockUpdate = callback;
					return pan;
				},
				onFinalize: (callback: typeof mockFinalize) => {
					mockFinalize = callback;
					return pan;
				},
			};
			return pan;
		},
	},
	GestureDetector: ({
		children,
		touchAction,
	}: React.PropsWithChildren<{ touchAction?: string }>) => (
		<div data-testid="pan-target" data-touch-action={touchAction}>
			{children}
		</div>
	),
}));

// A register column: the row 440 wide, Edit 88 and Remove 96 (the strip 184), the line at 264.
const ROW = 440;
const EDIT = 88;
const REMOVE = 96;
const STRIP = EDIT + REMOVE;
const LINE = 264;

function layout(testID: string, width: number) {
	act(() => mockLayouts[testID]({ nativeEvent: { layout: { width } } }));
}
function renderStrip({
	close,
	openLine = createOpenLine(),
}: { close?: number; openLine?: OpenLine } = {}) {
	const pulseRemove = jest.fn();
	const armRemove = jest.fn();
	const rowPress = jest.fn();
	const line = {
		uuid: 'line-1',
		type: 'line_items',
		item: { name: 'Tea' },
	} as React.ComponentProps<typeof LineStrip>['line'];
	const rowRefs = {
		current: new Map([['line-1', { pulseAdd: jest.fn(), armRemove, pulseRemove }]]),
	};
	render(
		<div onClick={rowPress}>
			<LineStrip line={line} rowRefs={rowRefs} openLine={openLine}>
				{(wrapTotal) => wrapTotal('10')}
			</LineStrip>
		</div>
	);
	layout('cart-line-row', ROW);
	layout('cart-line-edit-slot', EDIT);
	layout('cart-line-remove-slot', REMOVE);
	if (close) layout('cart-line-close-slot', close);
	return { pulseRemove, armRemove, rowPress, openLine };
}
/** A pull to `x` (leftwards negative) and the release, at `velocityX`. */
function pull(x: number, velocityX = 0) {
	act(() => mockStart());
	act(() => mockUpdate({ translationX: x }));
	act(() => mockFinalize({ translationX: x, velocityX }, true));
}
beforeEach(() => {
	jest.clearAllMocks();
	mockDisabled.length = 0;
	mockPointer = 'coarse';
});
it('U1: gives vertical touch pans to the browser', () => {
	renderStrip();
	expect(screen.getByTestId('pan-target').getAttribute('data-touch-action')).toBe('pan-y');
});
it('coarse uses a pan target without hover affordances', () => {
	renderStrip();
	expect(screen.getByTestId('pan-target')).toBeTruthy();
	expect(screen.getByTestId('cart-line-remove')).toBeTruthy();
	expect(mockTotalProps.className).not.toMatch(/hover|web:/);
	expect(mockTotalProps.onHoverIn).toBeUndefined();
	expect(mockTotalProps.onHoverOut).toBeUndefined();
	expect(screen.queryByTestId('cart-line-total-hover-reach')).toBeNull();
});
it('Remove is a solid red block, square and as tall as the row', () => {
	renderStrip();
	expect(mockButtonProps['cart-line-remove'].variant).toBe('destructive');
	expect(mockButtonProps['cart-line-remove'].className).toMatch(/\brounded-none\b/);
	expect(mockButtonProps['cart-line-remove'].className).toMatch(/\bh-auto\b/);
});
it('the Edit slot is the solid primary beside it, not the muted surface grey (Paul 2026-10-30)', () => {
	renderStrip();
	const classes = screen.getByTestId('cart-line-edit-slot').getAttribute('data-classes');
	expect(classes).toMatch(/\bbg-primary\b/);
	expect(classes).not.toMatch(/\bbg-muted\b/);
});
it('closed, the peeking Edit slot takes no pointer; open, it does', () => {
	renderStrip();
	// The rule text on the slot's own class: jsdom's cascade drops `!important`, so the strip's `>*` wins.
	const pointer = () => {
		const slot = screen.getByTestId('cart-line-edit-slot');
		const cls = Array.from(slot.classList).find((c) => c.startsWith('r-pointerEvents-'));
		const all = Array.from(document.styleSheets).flatMap((s) => Array.from(s.cssRules));
		return all.find((r) => (r as CSSStyleRule).selectorText === `.${cls}`)?.cssText;
	};
	expect(pointer()).toContain('pointer-events: none');
	fireEvent.click(screen.getByTestId('cart-line-total'));
	expect(pointer()).toContain('pointer-events: auto');
});
it('fine keeps the hover nudge and takes the held mouse as the pan', () => {
	mockPointer = 'fine';
	renderStrip();
	expect(screen.getByTestId('pan-target')).toBeTruthy();
	act(() => mockTotalProps.onHoverIn?.());
	expect(mockOffsetSet).toHaveBeenLastCalledWith(-16);
	act(() => mockTotalProps.onHoverOut?.());
	expect(mockOffsetSet).toHaveBeenLastCalledWith(0);
});
it('fine keeps the hover area under the pointer while the row bounces', () => {
	mockPointer = 'fine';
	renderStrip();
	// The reach hangs off the total's right edge by more than the bounce travels (16 px peek,
	// about 22 px at the top of the overshoot), so a pointer on the total never loses hover.
	const reach = screen.getByTestId('cart-line-total-hover-reach');
	expect(screen.getByTestId('cart-line-total').contains(reach)).toBe(true);
	expect(parseFloat(reach.style.right)).toBeLessThanOrEqual(-22);
	// Opened, the reach would overhang Edit's left edge and take its presses.
	fireEvent.click(screen.getByTestId('cart-line-total'));
	expect(screen.queryByTestId('cart-line-total-hover-reach')).toBeNull();
	fireEvent.click(screen.getByTestId('cart-line-total'));
	expect(screen.getByTestId('cart-line-total-hover-reach')).toBeTruthy();
});
it('fine: a hover-out bound before the press does not close the opened strip', () => {
	mockPointer = 'fine';
	renderStrip();
	// react-native-web keeps the hover-out closure it bound when the pointer entered.
	const staleHoverOut = mockTotalProps.onHoverOut;
	act(() => mockTotalProps.onHoverIn?.());
	fireEvent.click(screen.getByTestId('cart-line-total'));
	expect(mockOffsetSet).toHaveBeenLastCalledWith(-STRIP);
	act(() => staleHoverOut?.());
	expect(mockOffsetSet).toHaveBeenLastCalledWith(-STRIP);
});
it('never paints the row right of its rest, whatever the spring does', () => {
	// A hover landing mid-close inherits the closing velocity and the bounce overshoots 0.
	expect(onStage(7)).toBe(0);
	expect(onStage(0)).toBe(0);
	expect(onStage(-21.8)).toBe(-21.8);
});
it('a press of Remove arms the row, then forwards one removal to pulseRemove, never disabling', async () => {
	const { pulseRemove, armRemove } = renderStrip();
	const button = screen.getByTestId('cart-line-remove');
	for (let i = 0; i < 3; i++) fireEvent.click(button);
	// The flight latches here; pulseRemove keeps its own latch for the committed removal.
	expect(armRemove).toHaveBeenCalledWith(true);
	expect(mockHaptic).toHaveBeenCalledTimes(1);
	expect(pulseRemove).toHaveBeenCalledTimes(1);
	expect(mockDisabled.every((disabled) => disabled === undefined)).toBe(true);
	expect(button.hasAttribute('disabled')).toBe(false);
	expect(mockRemoveLineItem).not.toHaveBeenCalled();
	await act(async () => {
		await pulseRemove.mock.calls[0][0]();
	});
	expect(mockRemoveLineItem).toHaveBeenCalledTimes(1);
	expect(mockRemoveLineItem).toHaveBeenCalledWith('line-1', 'line_items');
});
it('a failed removal brings the row back on stage and leaves it removable', async () => {
	const { pulseRemove, armRemove } = renderStrip();
	mockRemoveLineItem.mockRejectedValueOnce(new Error('write failed'));
	fireEvent.click(screen.getByTestId('cart-line-remove'));
	await act(async () => {
		await pulseRemove.mock.calls[0][0]();
	});
	expect(armRemove).toHaveBeenLastCalledWith(false);
	expect(mockOffsetSet).toHaveBeenLastCalledWith(0);
	fireEvent.click(screen.getByTestId('cart-line-remove'));
	expect(pulseRemove).toHaveBeenCalledTimes(2);
});
it('consumes the swipe-release press without closing the strip or pressing the row', () => {
	const { rowPress } = renderStrip();
	pull(-120);
	mockOffsetSet.mockClear();
	fireEvent.click(screen.getByTestId('cart-line-total'));
	expect(rowPress).not.toHaveBeenCalled();
	expect(mockOffsetSet).not.toHaveBeenCalledWith(0);
	fireEvent.click(screen.getByTestId('cart-line-total'));
	expect(mockOffsetSet).toHaveBeenLastCalledWith(0);
});
it('a pull short of the line opens the strip or goes home, and never arms the row', () => {
	const { armRemove, pulseRemove } = renderStrip();
	pull(-LINE + 1);
	expect(mockOffsetSet).toHaveBeenLastCalledWith(-STRIP);
	expect(armRemove).not.toHaveBeenCalledWith(true);
	expect(mockHaptic).not.toHaveBeenCalled();
	// Open, a pull back towards home (the strip's base is already -184) lands short of half.
	pull(100);
	expect(mockOffsetSet).toHaveBeenCalledWith(0);
	expect(pulseRemove).not.toHaveBeenCalled();
});
it('crossing the line arms the row with one tick, and coming back disarms it with another', () => {
	const { armRemove } = renderStrip();
	act(() => mockStart());
	act(() => mockUpdate({ translationX: -LINE }));
	expect(armRemove).toHaveBeenLastCalledWith(true);
	expect(screen.getByTestId('cart-line-edit-slot').getAttribute('aria-hidden')).toBe('true');
	// Hovering around the line is not a drum roll.
	act(() => mockUpdate({ translationX: -LINE - 10 }));
	expect(mockHaptic).toHaveBeenCalledTimes(1);
	act(() => mockUpdate({ translationX: -LINE + 1 }));
	expect(armRemove).toHaveBeenLastCalledWith(false);
	expect(mockHaptic).toHaveBeenCalledTimes(2);
	act(() => mockFinalize({ translationX: -LINE + 1, velocityX: 0 }, true));
	expect(mockOffsetSet).toHaveBeenLastCalledWith(-STRIP);
});
it('letting go past the line removes the line through pulseRemove', () => {
	const { pulseRemove } = renderStrip();
	pull(-LINE);
	expect(pulseRemove).toHaveBeenCalledTimes(1);
	// Already on its way: nothing retargets it.
	fireEvent.click(screen.getByTestId('cart-line-remove'));
	act(() => mockTotalProps.onHoverIn?.());
	expect(pulseRemove).toHaveBeenCalledTimes(1);
});
it('a fast flick past the open strip removes without reaching the line', () => {
	const { pulseRemove, armRemove } = renderStrip();
	pull(-STRIP - 20, -900);
	expect(armRemove).toHaveBeenCalledWith(true);
	expect(pulseRemove).toHaveBeenCalledTimes(1);
});
it('an interrupted gesture past the line is not a release: it disarms and goes back to its rest', () => {
	const { pulseRemove, armRemove } = renderStrip();
	act(() => mockStart());
	act(() => mockUpdate({ translationX: -LINE }));
	expect(armRemove).toHaveBeenLastCalledWith(true);
	act(() => mockFinalize({ translationX: -LINE, velocityX: 0 }, false));
	expect(armRemove).toHaveBeenLastCalledWith(false);
	expect(mockOffsetSet).toHaveBeenLastCalledWith(0);
	expect(pulseRemove).not.toHaveBeenCalled();
});
it('a removal cancelled before it commits brings the row back and leaves it removable', () => {
	const { pulseRemove, armRemove } = renderStrip();
	fireEvent.click(screen.getByTestId('cart-line-remove'));
	expect(pulseRemove).toHaveBeenCalledTimes(1);
	// An add pulse took over mid-removal: the row never unmounted.
	const options = pulseRemove.mock.calls[0][1] as { onCancel: () => void };
	act(() => options.onCancel());
	expect(armRemove).toHaveBeenLastCalledWith(false);
	expect(mockOffsetSet).toHaveBeenLastCalledWith(0);
	fireEvent.click(screen.getByTestId('cart-line-remove'));
	expect(pulseRemove).toHaveBeenCalledTimes(2);
});
it("the actions paint over the row: the strip's window comes after the body and clips", () => {
	renderStrip();
	const row = screen.getByTestId('cart-line-row');
	const windowEl = screen.getByTestId('cart-line-strip-window');
	const strip = screen.getByTestId('cart-line-strip');
	expect(row.lastElementChild).toBe(windowEl);
	expect(windowEl.contains(strip)).toBe(true);
	expect(windowEl.getAttribute('data-classes')).toMatch(/\boverflow-hidden\b/);
	// The window is the row wide and moves by transform, never pinned right and resized.
	expect(windowEl.getAttribute('data-classes')).toMatch(/\binset-0\b/);
	expect(windowEl.getAttribute('data-classes')).not.toMatch(/\bright-0\b/);
	// Nothing of the strip sits before the body, under it.
	const body = row.firstElementChild;
	expect(body).not.toBe(windowEl);
	expect(body?.contains(strip)).toBe(false);
});

describe('the strip closes with a mouse (the 2026-11-21 board)', () => {
	// The en Close tile: the Total column's 72.
	const CLOSE = 72;
	const isOpen = () => !!screen.queryByTestId('cart-line-close-catch');
	it('coarse pointer: no Close tile, and the strip opens to Edit and Remove only', () => {
		renderStrip({ close: CLOSE });
		expect(screen.queryByTestId('cart-line-close')).toBeNull();
		fireEvent.click(screen.getByTestId('cart-line-total'));
		expect(mockOffsetSet).toHaveBeenLastCalledWith(-STRIP);
	});
	it('fine pointer: Close is the quiet Button at the trailing end, and the strip makes room for it', () => {
		mockPointer = 'fine';
		renderStrip({ close: CLOSE });
		const strip = screen.getByTestId('cart-line-strip');
		expect(strip.lastElementChild).toBe(screen.getByTestId('cart-line-close-slot'));
		expect(screen.getByTestId('cart-line-close-slot').getAttribute('data-classes')).toMatch(
			/\bbg-card\b/
		);
		expect(mockButtonProps['cart-line-close'].variant).toBe('ghost');
		expect(mockButtonProps['cart-line-close'].className).toMatch(/\brounded-none\b/);
		expect(mockButtonProps['cart-line-close'].className).toMatch(/\bh-auto\b/);
		expect(screen.getByTestId('cart-line-close').textContent).toBe('common.close');
		fireEvent.click(screen.getByTestId('cart-line-total'));
		expect(mockOffsetSet).toHaveBeenLastCalledWith(-(STRIP + CLOSE));
	});
	it('Close closes the strip', () => {
		mockPointer = 'fine';
		renderStrip({ close: CLOSE });
		fireEvent.click(screen.getByTestId('cart-line-total'));
		expect(isOpen()).toBe(true);
		fireEvent.click(screen.getByTestId('cart-line-close'));
		expect(isOpen()).toBe(false);
		expect(mockOffsetSet).toHaveBeenLastCalledWith(0);
	});
	it('after Close, the pointer still on the total does not peek until it has left and come back', () => {
		mockPointer = 'fine';
		renderStrip({ close: CLOSE });
		// A mouse click: the browser counts it (`detail` 1).
		fireEvent.click(screen.getByTestId('cart-line-total'), { detail: 1 });
		fireEvent.click(screen.getByTestId('cart-line-close'), { detail: 1 });
		act(() => mockTotalProps.onHoverIn?.());
		expect(mockOffsetSet).toHaveBeenLastCalledWith(0);
		act(() => mockTotalProps.onHoverOut?.());
		act(() => mockTotalProps.onHoverIn?.());
		expect(mockOffsetSet).toHaveBeenLastCalledWith(-16);
	});
	it('Close pressed from the keyboard does not hold back the next peek', () => {
		mockPointer = 'fine';
		renderStrip({ close: CLOSE });
		fireEvent.click(screen.getByTestId('cart-line-total'), { detail: 0 });
		// Enter or Space on a Button: react-native-web presses with a click no pointer made.
		fireEvent.click(screen.getByTestId('cart-line-close'), { detail: 0 });
		act(() => mockTotalProps.onHoverIn?.());
		expect(mockOffsetSet).toHaveBeenLastCalledWith(-16);
	});
	it('Escape closes an open strip and hands the focus back to the total', () => {
		mockPointer = 'fine';
		renderStrip({ close: CLOSE });
		fireEvent.click(screen.getByTestId('cart-line-total'));
		fireEvent.keyDown(document, { key: 'Escape' });
		expect(isOpen()).toBe(false);
		expect(document.activeElement).toBe(screen.getByTestId('cart-line-total'));
	});
	it('Escape struck in another surface (an Edit sheet) is that surface’s', () => {
		renderStrip();
		fireEvent.click(screen.getByTestId('cart-line-total'));
		const field = document.body.appendChild(document.createElement('input'));
		field.focus();
		fireEvent.keyDown(field, { key: 'Escape' });
		expect(isOpen()).toBe(true);
		field.remove();
	});
	it('Enter or Space on the total opens the strip with the focus on Edit', () => {
		mockPointer = 'fine';
		renderStrip({ close: CLOSE });
		const total = screen.getByTestId('cart-line-total');
		total.focus();
		// What Chromium hands react-native-web for Enter on the total: a click with `detail` 0.
		fireEvent.click(total, { detail: 0 });
		expect(isOpen()).toBe(true);
		expect(document.activeElement).toBe(screen.getByTestId('cart-line-edit'));
	});
	it('an interrupted gesture bound before the strip opened sends it back to open, not home', () => {
		// Gesture Handler finalizes a pan from an earlier render (seen in Chromium after Enter on the total).
		renderStrip();
		// The pan's finalize as bound while the strip was closed.
		const bound = mockFinalize;
		fireEvent.click(screen.getByTestId('cart-line-total'), { detail: 0 });
		act(() => bound({ translationX: 0, velocityX: 0 }, false));
		expect(mockOffsetSet).toHaveBeenLastCalledWith(-STRIP);
		expect(isOpen()).toBe(true);
	});
	it('a mouse click on the total opens the strip and leaves the focus where it is', () => {
		mockPointer = 'fine';
		renderStrip({ close: CLOSE });
		const total = screen.getByTestId('cart-line-total');
		total.focus();
		fireEvent.click(total, { detail: 1 });
		expect(isOpen()).toBe(true);
		expect(document.activeElement).toBe(total);
	});
	it('a closed strip offers no tab stops; open, Edit, Remove and Close are the tab order', () => {
		mockPointer = 'fine';
		renderStrip({ close: CLOSE });
		const tiles = ['cart-line-edit', 'cart-line-remove', 'cart-line-close'];
		const stops = () => tiles.map((id) => screen.getByTestId(id).getAttribute('tabindex'));
		expect(stops()).toEqual(['-1', '-1', '-1']);
		fireEvent.click(screen.getByTestId('cart-line-total'), { detail: 1 });
		expect(stops()).toEqual(['0', '0', '0']);
		const order = screen.getByTestId('cart-line-strip').querySelectorAll('[role="button"]');
		expect(Array.from(order, (el) => el.getAttribute('data-testid'))).toEqual(tiles);
	});
	it('a wide fallback press target never pushes Edit and Remove out of the row', () => {
		mockPointer = 'fine';
		// The Total column hidden: the Name is the press target, its leading edge 40 px into a 440 row.
		const rect = jest
			.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
			.mockImplementation(function (this: HTMLElement) {
				const total = this.getAttribute('data-testid') === 'cart-line-total';
				return { left: total ? 40 : 0, right: 440 } as DOMRect;
			});
		renderStrip({ close: CLOSE });
		const slot = screen.getByTestId('cart-line-close-slot');
		expect(parseFloat(slot.style.minWidth)).toBe(ROW - STRIP);
		rect.mockRestore();
	});
	it("the open line's press catch is no tab stop and is hidden from assistive tech", () => {
		renderStrip();
		fireEvent.click(screen.getByTestId('cart-line-total'));
		const catcher = screen.getByTestId('cart-line-close-catch');
		expect(catcher.getAttribute('tabindex')).toBe('-1');
		expect(catcher.getAttribute('aria-hidden')).toBe('true');
	});
	it('focus never scrolls the row: the row and the strip window clip on web', () => {
		renderStrip();
		expect(screen.getByTestId('cart-line-strip-window').getAttribute('data-classes')).toMatch(
			/\bweb:overflow-clip\b/
		);
		expect(mockRowClasses).toMatch(/\bweb:overflow-clip\b/);
	});
	it('a press outside the open line closes it and still reaches what it landed on', () => {
		const outside = jest.fn();
		renderStrip();
		const tile = document.body.appendChild(document.createElement('button'));
		tile.addEventListener('click', outside);
		fireEvent.click(screen.getByTestId('cart-line-total'));
		// Inside the line (its own strip) it stays open.
		fireEvent.pointerDown(screen.getByTestId('cart-line-remove-slot'));
		expect(isOpen()).toBe(true);
		fireEvent.pointerDown(tile);
		fireEvent.click(tile);
		expect(isOpen()).toBe(false);
		expect(outside).toHaveBeenCalledTimes(1);
		tile.remove();
	});
	it("a press on the open line's own name or quantity closes it and does nothing else", () => {
		const { rowPress } = renderStrip();
		fireEvent.click(screen.getByTestId('cart-line-total'));
		// The catch lies over the body's cells, under the strip.
		const catcher = screen.getByTestId('cart-line-close-catch');
		expect(screen.getByTestId('cart-line-body').lastElementChild).toBe(catcher);
		fireEvent.click(catcher);
		expect(isOpen()).toBe(false);
		expect(rowPress).not.toHaveBeenCalled();
	});
	it('one open strip per cart: opening a line closes the other, and a scroll closes it', () => {
		const openLine = createOpenLine();
		const rowRefs = { current: new Map() };
		const row = (uuid: string) => (
			<LineStrip
				line={{ uuid, type: 'line_items', item: { name: uuid } } as never}
				rowRefs={rowRefs}
				openLine={openLine}
			>
				{(wrapTotal) => wrapTotal(uuid)}
			</LineStrip>
		);
		render(
			<>
				{row('a')}
				{row('b')}
			</>
		);
		const [a, b] = screen.getAllByTestId('cart-line-total');
		fireEvent.click(a);
		expect(screen.getAllByTestId('cart-line-close-catch')).toHaveLength(1);
		// Opened by a swipe, by the keyboard or by a click alike: the store closes the one before.
		fireEvent.click(b);
		const catches = screen.getAllByTestId('cart-line-close-catch');
		expect(catches).toHaveLength(1);
		expect(screen.getAllByTestId('cart-line-body')[1].contains(catches[0])).toBe(true);
		act(() => openLine.close());
		expect(screen.queryByTestId('cart-line-close-catch')).toBeNull();
	});
	it("Remove's label reads Edit's weight", () => {
		renderStrip();
		expect(
			screen.getByTestId('cart-line-remove').querySelector('span')?.getAttribute('data-classes')
		).toMatch(/\bfont-strong\b/);
	});
	it('the strip draws its tiles’ focus ring inside them', () => {
		renderStrip();
		expect(screen.getByTestId('cart-line-strip').getAttribute('data-ring')).toBe('inset');
	});
});

describe('the open line tells its name cell where the strip begins', () => {
	function Probe() {
		const edge = React.useContext(StripEdgeContext);
		return <span data-testid="edge">{edge === null ? 'none' : 'edge'}</span>;
	}
	function renderWithProbe() {
		render(
			<LineStrip
				line={{ uuid: 'p', type: 'line_items', item: { name: 'p' } } as never}
				rowRefs={{ current: new Map() }}
				openLine={createOpenLine()}
			>
				{(wrapTotal) => [<Probe key="probe" />, wrapTotal('10')]}
			</LineStrip>
		);
	}
	const edge = () => screen.getByTestId('edge').textContent;
	it('fine pointer: only while open', () => {
		mockPointer = 'fine';
		renderWithProbe();
		expect(edge()).toBe('none');
		fireEvent.click(screen.getByTestId('cart-line-total'));
		expect(edge()).toBe('edge');
		fireEvent.click(screen.getByTestId('cart-line-total'));
		expect(edge()).toBe('none');
	});
	it('touch: never, open or not', () => {
		renderWithProbe();
		fireEvent.click(screen.getByTestId('cart-line-total'));
		expect(edge()).toBe('none');
	});
});
