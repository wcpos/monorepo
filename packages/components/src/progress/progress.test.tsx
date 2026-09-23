import { readFileSync } from 'node:fs';

import * as React from 'react';
import type { LayoutChangeEvent, ViewProps } from 'react-native';

import { act, render } from '@testing-library/react';

const mockPlatform = { OS: 'web' };
const mockLayouts: NonNullable<ViewProps['onLayout']>[] = [];
const mockSharedValues: { value: unknown }[] = [];
const mockStyles: (() => object)[] = [];
const mockDerived: { value: unknown; factory: () => unknown }[] = [];
const mockTiming = jest.fn((toValue: number, config: unknown) => ({ toValue, config }));
const mockRepeat = jest.fn((...args: unknown[]) => ({ args }));
const mockCancel = jest.fn();
const mockRootProps: Record<string, unknown>[] = [];

jest.mock('react-native', () => ({
	Platform: {
		select: (choices: Record<string, unknown>) =>
			choices[mockPlatform.OS] ?? choices.native ?? choices.default,
	},
	View: ({ children, className, style, onLayout }: ViewProps) => {
		if (onLayout) mockLayouts.push(onLayout);
		return (
			<div className={className} style={style as React.CSSProperties}>
				{children}
			</div>
		);
	},
}));
jest.mock('@rn-primitives/progress', () => ({
	Root: ({ children, className, onLayout, ...rest }: ViewProps & Record<string, unknown>) => {
		mockRootProps.push(rest);
		if (onLayout) mockLayouts.push(onLayout);
		return (
			<div data-testid="track" className={className}>
				{children}
			</div>
		);
	},
	Indicator: ({ className }: ViewProps) => <div data-testid="indicator" className={className} />,
}));
jest.mock('react-native-worklets', () => ({ scheduleOnRN: jest.fn() }));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		View: ({ children, className }: ViewProps) => (
			<div data-testid="animated" className={className}>
				{children}
			</div>
		),
	},
	Easing: { bezier: () => 'standard-easing' },
	ReduceMotion: { Never: 'never' },
	useAnimatedReaction: jest.fn(),
	useAnimatedStyle: (factory: () => object) => {
		mockStyles.push(factory);
		return factory();
	},
	useDerivedValue: (factory: () => unknown) => {
		const shared = React.useRef({ value: 0 as unknown, factory }).current;
		shared.factory = factory;
		if (!mockDerived.includes(shared)) mockDerived.push(shared);
		return shared;
	},
	useSharedValue: (value: unknown) => {
		const shared = React.useRef({ value }).current;
		if (!mockSharedValues.includes(shared)) mockSharedValues.push(shared);
		return shared;
	},
	withTiming: (toValue: number, config: unknown) => mockTiming(toValue, config),
	withRepeat: (...args: unknown[]) => mockRepeat(...args),
	cancelAnimation: (shared: unknown) => mockCancel(shared),
}));

// eslint-disable-next-line import/first
import { Progress } from './index';

beforeEach(() => {
	mockPlatform.OS = 'web';
	mockLayouts.length = 0;
	mockSharedValues.length = 0;
	mockStyles.length = 0;
	mockDerived.length = 0;
	mockRootProps.length = 0;
	jest.clearAllMocks();
});

it('renders the determinate muted track and indicator at the value', () => {
	const { getByTestId } = render(<Progress value={60} indicatorClassName="bg-success" />);
	expect(getByTestId('track')).toHaveClass('bg-muted', 'h-2');
	expect(getByTestId('indicator').parentElement).toHaveStyle({ transform: 'translateX(-40%)' });
	expect(getByTestId('indicator')).toHaveClass('bg-success');
	expect(getByTestId('indicator').parentElement).not.toHaveClass('bg-success');
});

it('renders the web indeterminate sweep instead of the indicator', () => {
	const { getByTestId, queryByTestId } = render(<Progress indeterminate value={60} />);
	const track = getByTestId('track');
	expect(track).toHaveClass('bg-border', 'h-0.5');
	expect(queryByTestId('indicator')).toBeNull();
	expect(track.querySelector('.bg-primary')).toHaveClass(
		'web:animate-indeterminate',
		'absolute',
		'h-full',
		'w-1/3'
	);
	expect(mockRepeat).not.toHaveBeenCalled();
});

it('runs a width-free native loop scaled by the measured track and cancels on unmount', () => {
	mockPlatform.OS = 'ios';
	const { unmount, queryByTestId } = render(<Progress indeterminate value={60} />);
	expect(queryByTestId('indicator')).toBeNull();
	// The derived value runs on the UI thread from mount; the mock runs its factory here.
	const progress = mockDerived.at(-1)!;
	progress.value = progress.factory();
	// The repeat starts from mount, 0 → 1, independent of the width.
	expect(mockTiming).toHaveBeenCalledWith(1, {
		duration: 1100,
		easing: 'standard-easing',
		reduceMotion: 'never',
	});
	expect(mockRepeat).toHaveBeenCalledWith(
		mockTiming.mock.results[0].value,
		-1,
		false,
		undefined,
		'never'
	);
	expect(progress.value).toBe(mockRepeat.mock.results[0].value);
	// Before layout the sweep stays at 0; after it the style scales by track + sweep width.
	progress.value = 0.5;
	expect(mockStyles.at(-1)!()).toEqual({ transform: [{ translateX: 0 }] });
	act(() => mockLayouts.at(-1)!({ nativeEvent: { layout: { width: 300 } } } as LayoutChangeEvent));
	expect(mockStyles.at(-1)!()).toEqual({ transform: [{ translateX: 200 }] });
	unmount();
	expect(mockCancel).toHaveBeenCalledWith(progress);
});

it('announces an indeterminate wait as busy with no current value on native', () => {
	mockPlatform.OS = 'ios';
	render(<Progress indeterminate value={60} accessibilityState={{ disabled: true }} />);
	const root = mockRootProps.at(-1)!;
	expect(root.value).toBeUndefined();
	expect(root.accessibilityState).toEqual({ disabled: true, busy: true });
	expect(root.accessibilityValue).toEqual({ min: 0, max: 100 });
	expect(root['aria-valuenow']).toBeUndefined();
	expect(root['aria-valuetext']).toBeUndefined();
});

it('passes indicatorClassName to the sweep', () => {
	const { getByTestId } = render(<Progress indeterminate indicatorClassName="bg-success" />);
	expect(getByTestId('track').querySelector('.bg-success')).not.toBeNull();
});

it('uses named durations only', () => {
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8')).not.toMatch(/duration:\s*[1-9]/);
});
