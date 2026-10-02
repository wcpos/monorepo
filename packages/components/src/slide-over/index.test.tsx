import * as React from 'react';
import type { ViewProps } from 'react-native';

import { act, render, screen } from '@testing-library/react';

type CoverStyle = {
	transform: { translateX?: string; translateY?: string }[];
	transitionProperty: string;
	transitionDuration: number;
	transitionTimingFunction: string;
	pointerEvents: string;
};
let mockCover: CoverStyle;
let mockReduced = false;

jest.mock('react-native', () => ({
	View: ({ children, testID }: ViewProps) => <div data-testid={testID}>{children}</div>,
}));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		View: ({ children, style }: ViewProps) => {
			mockCover = style as unknown as CoverStyle;
			return <div data-testid="cover">{children}</div>;
		},
	},
	Easing: { bezier: () => 'ease' },
	cubicBezier: (...points: number[]) => points.join(),
	useReducedMotion: () => mockReduced,
}));

// eslint-disable-next-line import/first
import { SlideOver } from './index';

type Edge = 'top' | 'bottom' | 'left' | 'right';
function Stage({ open, from = 'bottom' }: { open: boolean; from?: Edge }) {
	return (
		<SlideOver open={open} from={from} testID="frame">
			<span data-testid="content">orders</span>
		</SlideOver>
	);
}

let frames: FrameRequestCallback[] = [];
const nextFrame = () => act(() => frames.splice(0).forEach((callback) => callback(0)));

beforeEach(() => {
	mockReduced = false;
	frames = [];
	jest.useFakeTimers();
	jest
		.spyOn(window, 'requestAnimationFrame')
		.mockImplementation((callback) => frames.push(callback));
	jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
		frames = [];
	});
});
afterEach(() => {
	jest.useRealTimers();
	jest.restoreAllMocks();
});

it('renders nothing while closed', () => {
	render(<Stage open={false} />);
	expect(screen.queryByTestId('frame')).toBeNull();
	expect(screen.queryByTestId('content')).toBeNull();
});

it.each([
	['bottom', 'translateY', '100%'],
	['top', 'translateY', '-100%'],
	['right', 'translateX', '100%'],
	['left', 'translateX', '-100%'],
] as const)(
	'a cover from the %s is parked outside its frame for one frame, then lands',
	(from, axis, parked) => {
		const { rerender } = render(<Stage open={false} from={from} />);
		rerender(<Stage open from={from} />);
		// Painted parked first: the transition needs a position to start from.
		expect(mockCover.transform).toEqual([{ [axis]: parked }]);
		nextFrame();
		expect(mockCover.transform).toEqual([{ [axis]: '0%' }]);
		// Only the transform moves, over the pane beat on the shared ease.
		expect(mockCover).toMatchObject({
			transitionProperty: 'transform',
			transitionDuration: 280,
			transitionTimingFunction: '0.2,0.7,0.2,1',
			pointerEvents: 'auto',
		});
	}
);

it('leaves faster, speeding up into its edge, and stays mounted until it has left', () => {
	const { rerender } = render(<Stage open />);
	nextFrame();
	rerender(<Stage open={false} />);
	expect(mockCover.transform).toEqual([{ translateY: '100%' }]);
	expect(mockCover).toMatchObject({
		transitionDuration: 200,
		transitionTimingFunction: '0.4,0,1,1',
		// A cover that is leaving takes no presses.
		pointerEvents: 'none',
	});
	act(() => void jest.advanceTimersByTime(199));
	expect(screen.getByTestId('content')).toBeTruthy();
	act(() => void jest.advanceTimersByTime(1));
	expect(screen.queryByTestId('content')).toBeNull();
});

it('says when it has left, and not when the close was interrupted', () => {
	const onLeft = jest.fn();
	const stage = (open: boolean) => (
		<SlideOver open={open} from="right" onLeft={onLeft}>
			<span />
		</SlideOver>
	);
	const { rerender } = render(stage(true));
	nextFrame();
	rerender(stage(false));
	act(() => void jest.advanceTimersByTime(100));
	rerender(stage(true));
	act(() => void jest.advanceTimersByTime(500));
	expect(onLeft).not.toHaveBeenCalled();
	rerender(stage(false));
	act(() => void jest.advanceTimersByTime(200));
	expect(onLeft).toHaveBeenCalledTimes(1);
	// A cover that mounts closed never opened: it has not left.
	onLeft.mockClear();
	render(stage(false));
	act(() => void jest.advanceTimersByTime(500));
	expect(onLeft).not.toHaveBeenCalled();
});

it('a close interrupted by a reopen leaves the cover mounted', () => {
	const { rerender } = render(<Stage open />);
	nextFrame();
	rerender(<Stage open={false} />);
	act(() => void jest.advanceTimersByTime(100));
	rerender(<Stage open />);
	act(() => void jest.advanceTimersByTime(500));
	nextFrame();
	expect(screen.getByTestId('content')).toBeTruthy();
	expect(mockCover.transform).toEqual([{ translateY: '0%' }]);
});

it('does not travel under reduce-motion', () => {
	mockReduced = true;
	const { rerender } = render(<Stage open />);
	nextFrame();
	expect(mockCover.transitionDuration).toBe(0);
	rerender(<Stage open={false} />);
	act(() => void jest.advanceTimersByTime(0));
	expect(screen.queryByTestId('content')).toBeNull();
});
