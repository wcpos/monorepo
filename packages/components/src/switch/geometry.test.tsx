import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Switch } from './index';
import { CROSSFADE, EASE } from '../lib/motion';

const animatedViews: Record<string, unknown>[] = [];
const styles: (() => { transform?: { translateX: number }[] })[] = [];
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.default },
	// Keep the classes RN-web drops without Uniwind, and the overlay's pointer events.
	View: ({
		children,
		className,
		pointerEvents,
	}: React.PropsWithChildren<{ className?: string; pointerEvents?: string }>) => (
		<div className={className} data-pointer-events={pointerEvents}>
			{children}
		</div>
	),
}));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		View: (props: Record<string, unknown>) => {
			animatedViews.push(props);
			return <div>{props.children as React.ReactNode}</div>;
		},
	},
	Easing: { bezier: () => (value: number) => value },
	useSharedValue: (value: number) => ({ value }),
	useDerivedValue: (callback: () => number) => ({ value: callback() }),
	useAnimatedStyle: (callback: () => object) => {
		styles.push(callback);
		return {};
	},
	withTiming: jest.fn((value: number) => value),
	interpolateColor: () => '',
}));
jest.mock('uniwind', () => ({ useCSSVariable: () => ['border', 'primary'] }));
jest.mock('@rn-primitives/switch', () => ({
	Root: ({ children, className, testID }: React.PropsWithChildren<Record<string, string>>) => (
		<div data-testid={testID} className={className}>
			{children}
		</div>
	),
	Thumb: () => null,
}));
jest.mock('../label', () => ({ Label: () => null }));

it.each([
	[34, 16, 2],
	[51, 24, 3],
])('measures native travel for track %s, thumb %s, padding %s', (width, thumb, padding) => {
	animatedViews.length = 0;
	styles.length = 0;
	render(<Switch onCheckedChange={() => {}} checked />);
	const translate = () => styles[1]().transform?.[0].translateX;
	expect(translate()).toBe(0);
	const layout = (props: Record<string, unknown>, width: number, x: number) => {
		(props.onLayout as (event: object) => void)({ nativeEvent: { layout: { width, x } } });
	};
	layout(animatedViews[0], width, 0);
	layout(animatedViews[1], thumb, padding);
	expect(translate()).toBe(width - thumb - 2 * padding);
	expect(jest.requireMock('react-native-reanimated').withTiming).toHaveBeenLastCalledWith(
		width - thumb - 2 * padding,
		{ duration: CROSSFADE, easing: EASE }
	);
});

it('gives the finger a 44 pt square over the drawn track without growing its layout', () => {
	animatedViews.length = 0;
	render(<Switch onCheckedChange={() => {}} checked testID="toggle" />);
	// The row lays out the drawn track only…
	expect(String(animatedViews[0].className).split(' ')).toEqual(
		expect.arrayContaining(['h-5', 'w-8.5'])
	);
	// …and the press area is the control token, centred over it and out of layout, so it
	// overflows the track (which iOS and Android both hit-test) instead of relying on hitSlop.
	const press = screen.getByTestId('toggle');
	expect(press).toHaveClass('h-ctl', 'w-ctl');
	expect(press.parentElement).toHaveClass('absolute', 'inset-0', 'items-center', 'justify-center');
	// The overlay itself never takes a touch meant for the track's neighbours.
	expect(press.parentElement).toHaveAttribute('data-pointer-events', 'box-none');
});
