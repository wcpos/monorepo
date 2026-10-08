/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { LineStrip, onStage } from './line-strip';

let mockPointer = 'coarse';
const mockRemoveLineItem = jest.fn().mockResolvedValue(undefined);
const mockOffsetSet = jest.fn();
const mockHaptic = jest.fn();
let mockStart: () => void;
let mockUpdate: (event: { translationX: number }) => void;
let mockFinalize: (event: { translationX: number; velocityX: number }) => void;
let mockTotalProps: { onHoverIn?: () => void; onHoverOut?: () => void; className?: string };
const mockLayouts: Record<string, (event: { nativeEvent: { layout: { width: number } } }) => void> =
	{};
const mockDisabled: unknown[] = [];
let mockRemoveProps: { variant?: string; className?: string };

jest.mock('@wcpos/components/lib/device', () => ({ usePointer: () => mockPointer }));
jest.mock('@wcpos/components/lib/haptics', () => ({ hapticTick: () => mockHaptic() }));
jest.mock('@wcpos/components/lib/motion', () => ({
	EASE: 'ease',
	EASE_EXIT: 'exit',
	PANEL_SLIDE_OUT: 200,
}));
jest.mock('../../../hooks/use-remove-line-item', () => ({
	useRemoveLineItem: () => ({ removeLineItem: mockRemoveLineItem }),
}));
jest.mock('../../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('../../cells/edit-cart-item-button', () => ({ EditCartItemButton: () => null }));
jest.mock('../../cells/edit-line-item', () => ({ EditLineItem: () => null }));
jest.mock('../../cells/edit-fee-line', () => ({ EditFeeLine: () => null }));
jest.mock('../../cells/edit-shipping-line', () => ({ EditShippingLine: () => null }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
		disabled,
		variant,
		className,
	}: React.PropsWithChildren<{
		testID: string;
		onPress: () => void;
		disabled?: boolean;
		variant?: string;
		className?: string;
	}>) => {
		mockDisabled.push(disabled);
		mockRemoveProps = { variant, className };
		return (
			<button data-testid={testID} onClick={onPress}>
				{children}
			</button>
		);
	},
}));
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		// Not a component to the compiler lint: the mock only records each slot's layout handler.
		View: (props: React.ComponentProps<typeof actual.View>) => {
			if (props.onLayout && props.testID) mockLayouts[props.testID] = props.onLayout;
			return <actual.View {...props} />;
		},
		Pressable: (props: React.ComponentProps<typeof actual.Pressable>) => {
			mockTotalProps = props;
			return <actual.Pressable {...props} />;
		},
	};
});
jest.mock('react-native-reanimated', () => {
	const actual = jest.requireActual('react-native');
	return {
		__esModule: true,
		default: {
			View: (props: React.ComponentProps<typeof actual.View>) => {
				if (props.onLayout && props.testID) mockLayouts[props.testID] = props.onLayout;
				return <actual.View {...props} />;
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
	GestureDetector: ({ children }: React.PropsWithChildren) => (
		<div data-testid="pan-target">{children}</div>
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
function renderStrip() {
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
			<LineStrip line={line} rowRefs={rowRefs}>
				{(wrapTotal) => wrapTotal('10')}
			</LineStrip>
		</div>
	);
	layout('cart-line-row', ROW);
	layout('cart-line-edit-slot', EDIT);
	layout('cart-line-remove-slot', REMOVE);
	return { pulseRemove, armRemove, rowPress };
}
/** A pull to `x` (leftwards negative) and the release, at `velocityX`. */
function pull(x: number, velocityX = 0) {
	act(() => mockStart());
	act(() => mockUpdate({ translationX: x }));
	act(() => mockFinalize({ translationX: x, velocityX }));
}
beforeEach(() => {
	jest.clearAllMocks();
	mockDisabled.length = 0;
	mockPointer = 'coarse';
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
	expect(mockRemoveProps.variant).toBe('destructive');
	expect(mockRemoveProps.className).toMatch(/\brounded-none\b/);
	expect(mockRemoveProps.className).toMatch(/\bh-auto\b/);
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
	act(() => mockFinalize({ translationX: -LINE + 1, velocityX: 0 }));
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
