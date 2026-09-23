import * as React from 'react';

import { render } from '@testing-library/react';

import { Switch } from './index';
import { CROSSFADE, EASE } from '../lib/motion';

const animatedViews: Record<string, unknown>[] = [];
const styles: (() => { transform?: { translateX: number }[] })[] = [];
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.default },
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
	Root: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
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
