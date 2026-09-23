import { readFileSync } from 'node:fs';

import * as React from 'react';
import type { LayoutChangeEvent, ViewProps } from 'react-native';

import { act, render } from '@testing-library/react';

const mockPlatform = { OS: 'web' };
const mockLayouts: NonNullable<ViewProps['onLayout']>[] = [];
const mockSharedValues: { value: unknown }[] = [];
const mockStyles: (() => object)[] = [];
const mockTiming = jest.fn((toValue: number, config: unknown) => ({ toValue, config }));
const mockRepeat = jest.fn((...args: unknown[]) => ({ args }));
const mockCancel = jest.fn();

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
	Root: ({ children, className, onLayout }: ViewProps) => {
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

it('starts the native sweep from measured layout and cancels on unmount', () => {
	mockPlatform.OS = 'ios';
	const { unmount, queryByTestId } = render(<Progress indeterminate value={60} />);
	expect(queryByTestId('indicator')).toBeNull();
	expect(mockRepeat).not.toHaveBeenCalled();
	act(() => mockLayouts.at(-1)!({ nativeEvent: { layout: { width: 300 } } } as LayoutChangeEvent));
	expect(mockTiming).toHaveBeenCalledWith(300, {
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
	const animated = mockSharedValues.find(
		(shared) => shared.value === mockRepeat.mock.results[0].value
	)!;
	expect(animated).toBeDefined();
	animated.value = -100;
	expect(mockStyles.at(-1)!()).toEqual({ transform: [{ translateX: -100 }] });
	unmount();
	expect(mockCancel).toHaveBeenCalledWith(animated);
});

it('uses named durations only', () => {
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8')).not.toMatch(/duration:\s*\d/);
});
