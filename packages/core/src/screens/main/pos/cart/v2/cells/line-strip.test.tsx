/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { LineStrip } from './line-strip';

let mockPointer = 'coarse';
const mockRemoveLineItem = jest.fn().mockResolvedValue(undefined);
const mockOffsetSet = jest.fn();
let mockUpdate: (event: { translationX: number }) => void;
let mockFinalize: (event: { translationX: number }) => void;
let mockTotalProps: { onHoverIn?: () => void; onHoverOut?: () => void; className?: string };
let mockLayout: (event: { nativeEvent: { layout: { width: number } } }) => void;
const mockDisabled: unknown[] = [];
let mockRemoveProps: { variant?: string; className?: string };

jest.mock('@wcpos/components/lib/device', () => ({ usePointer: () => mockPointer }));
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
		View: (props: React.ComponentProps<typeof actual.View>) => {
			if (props.onLayout) mockLayout = props.onLayout;
			return <actual.View {...props} />;
		},
		Pressable: (props: React.ComponentProps<typeof actual.Pressable>) => {
			mockTotalProps = props;
			return <actual.Pressable {...props} />;
		},
	};
});
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: jest.requireActual('react-native').View },
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
}));
jest.mock('react-native-gesture-handler', () => ({
	Gesture: {
		Pan: () => {
			const pan = {
				runOnJS: () => pan,
				activeOffsetX: () => pan,
				failOffsetY: () => pan,
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

function renderStrip() {
	const pulseRemove = jest.fn();
	const rowPress = jest.fn();
	const line = {
		uuid: 'line-1',
		type: 'line_items',
		item: { name: 'Tea' },
	} as React.ComponentProps<typeof LineStrip>['line'];
	const rowRefs = { current: new Map([['line-1', { pulseAdd: jest.fn(), pulseRemove }]]) };
	render(
		<div onClick={rowPress}>
			<LineStrip line={line} rowRefs={rowRefs}>
				{(wrapTotal) => wrapTotal('10')}
			</LineStrip>
		</div>
	);
	act(() => mockLayout({ nativeEvent: { layout: { width: 100 } } }));
	return { pulseRemove, rowPress };
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
it('fine uses the hover nudge rather than a pan', () => {
	mockPointer = 'fine';
	renderStrip();
	expect(screen.queryByTestId('pan-target')).toBeNull();
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
});
it('fine: a hover-out bound before the press does not close the opened strip', () => {
	mockPointer = 'fine';
	renderStrip();
	// react-native-web keeps the hover-out closure it bound when the pointer entered.
	const staleHoverOut = mockTotalProps.onHoverOut;
	act(() => mockTotalProps.onHoverIn?.());
	fireEvent.click(screen.getByTestId('cart-line-total'));
	expect(mockOffsetSet).toHaveBeenLastCalledWith(-100);
	act(() => staleHoverOut?.());
	expect(mockOffsetSet).toHaveBeenLastCalledWith(-100);
});
it('forwards every Remove press to pulseRemove, never disables, and waits for the pulse', async () => {
	const { pulseRemove } = renderStrip();
	const button = screen.getByTestId('cart-line-remove');
	for (let i = 0; i < 3; i++) fireEvent.click(button);
	expect(pulseRemove).toHaveBeenCalledTimes(3);
	expect(mockDisabled.every((disabled) => disabled === undefined)).toBe(true);
	expect(button.hasAttribute('disabled')).toBe(false);
	expect(mockRemoveLineItem).not.toHaveBeenCalled();
	await act(async () => {
		await pulseRemove.mock.calls[0][0]();
	});
	expect(mockRemoveLineItem).toHaveBeenCalledTimes(1);
	expect(mockRemoveLineItem).toHaveBeenCalledWith('line-1', 'line_items');
});
it('consumes the swipe-release press without closing the strip or pressing the row', () => {
	const { rowPress } = renderStrip();
	act(() => mockUpdate({ translationX: -60 }));
	act(() => mockFinalize({ translationX: -60 }));
	mockOffsetSet.mockClear();
	fireEvent.click(screen.getByTestId('cart-line-total'));
	expect(rowPress).not.toHaveBeenCalled();
	expect(mockOffsetSet).not.toHaveBeenCalledWith(0);
	fireEvent.click(screen.getByTestId('cart-line-total'));
	expect(mockOffsetSet).toHaveBeenLastCalledWith(0);
});
