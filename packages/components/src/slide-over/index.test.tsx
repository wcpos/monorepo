import * as React from 'react';
import type { ViewProps } from 'react-native';

import { act, render, screen } from '@testing-library/react';

type TimingCall = { toValue: number; config: unknown; done?: (finished: boolean) => void };
const mockTimings: TimingCall[] = [];
const mockShared: { value: number }[] = [];
const mockStyles: (() => { transform: { translateY: string }[] })[] = [];

const flatten = (style: unknown): Record<string, unknown> =>
	Object.assign({}, ...(Array.isArray(style) ? style : [style]).filter(Boolean));

jest.mock('react-native', () => ({
	View: ({ children, testID }: ViewProps) => <div data-testid={testID}>{children}</div>,
}));
jest.mock('react-native-worklets', () => ({
	scheduleOnRN: (callback: (...args: unknown[]) => void, ...args: unknown[]) => callback(...args),
}));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		View: ({ children, style }: ViewProps) => (
			<div data-testid="cover" data-pointer={flatten(style).pointerEvents as string}>
				{children}
			</div>
		),
	},
	Easing: { bezier: (...points: number[]) => points.join() },
	ReduceMotion: { System: 'system' },
	useAnimatedStyle: (factory: (typeof mockStyles)[number]) => {
		mockStyles.push(factory);
		return {};
	},
	useSharedValue: (value: number) => {
		const shared = React.useRef({ value }).current;
		if (!mockShared.includes(shared)) mockShared.push(shared);
		return shared;
	},
	withTiming: (toValue: number, config: unknown, done?: (finished: boolean) => void) => {
		mockTimings.push({ toValue, config, done });
		return toValue;
	},
}));

// eslint-disable-next-line import/first
import { SlideOver } from './index';

function Stage({ open, from = 'bottom' }: { open: boolean; from?: 'top' | 'bottom' }) {
	return (
		<SlideOver open={open} from={from} testID="frame">
			<span data-testid="content">orders</span>
		</SlideOver>
	);
}

beforeEach(() => {
	mockTimings.length = 0;
	mockShared.length = 0;
	mockStyles.length = 0;
	jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
		callback(0);
		return 1;
	});
});
afterEach(() => jest.restoreAllMocks());

const finish = (toValue: number, finished = true) =>
	act(() => {
		mockTimings.filter((call) => call.toValue === toValue).at(-1)!.done!(finished);
	});

it('renders nothing while closed', () => {
	render(<Stage open={false} />);
	expect(screen.queryByTestId('frame')).toBeNull();
	expect(screen.queryByTestId('content')).toBeNull();
});

it('opens by sliding in and stays mounted, taking no presses, until it has slid out', () => {
	const { rerender } = render(<Stage open={false} />);
	rerender(<Stage open />);
	expect(screen.getByTestId('content')).toBeTruthy();
	expect(mockTimings.at(-1)!.toValue).toBe(1);
	expect(screen.getByTestId('cover').dataset.pointer).toBe('auto');

	rerender(<Stage open={false} />);
	expect(mockTimings.at(-1)!.toValue).toBe(0);
	// It leaves faster than it arrives, on a curve that speeds up into the edge.
	expect(mockTimings.at(-1)!.config).toMatchObject({ duration: 200, easing: '0.4,0,1,1' });
	expect(screen.getByTestId('content')).toBeTruthy();
	expect(screen.getByTestId('cover').dataset.pointer).toBe('none');
	finish(0);
	expect(screen.queryByTestId('content')).toBeNull();
});

it('a close interrupted by a reopen leaves the cover mounted', () => {
	const { rerender } = render(<Stage open />);
	rerender(<Stage open={false} />);
	rerender(<Stage open />);
	// The cancelled close reports `finished: false`; it must not unmount what is reopening.
	finish(0, false);
	expect(screen.getByTestId('content')).toBeTruthy();
});

it.each([
	['bottom', '100%'],
	['top', '-100%'],
] as const)('a cover from the %s starts a full height outside its frame', (from, parked) => {
	render(<Stage open from={from} />);
	const [progress] = mockShared;
	const style = mockStyles.at(-1)!;

	progress.value = 0;
	expect(style().transform[0].translateY).toBe(parked);
	progress.value = 1;
	expect(parseFloat(style().transform[0].translateY)).toBe(0);
	// Clamped: an extrapolated bezier never lifts the cover off the edge it came from.
	progress.value = 1.05;
	expect(parseFloat(style().transform[0].translateY)).toBe(0);
	progress.value = -0.05;
	expect(style().transform[0].translateY).toBe(parked);
});
