import * as React from 'react';
import { Pressable, type PressableProps, StyleSheet, View, type ViewProps } from 'react-native';

import { render, screen } from '@testing-library/react';

import { OVERLAY_MOTION, type OverlayPresentation, OverlayShell, useOverlay } from './overlay';

const mockViews: ViewProps[] = [];
const mockScrimProps: PressableProps[] = [];
const mockAnimatedViews: (ViewProps & { entering?: unknown; exiting?: unknown })[] = [];

jest.mock('react-native', () => {
	const actual = jest.requireActual<typeof import('react-native')>('react-native');
	return {
		...actual,
		Platform: {
			...actual.Platform,
			OS: 'ios',
			select: (o: { ios?: unknown; native?: unknown; default?: unknown }) =>
				o.ios ?? o.native ?? o.default,
		},
		// RN-web omits native-only props from the DOM; record them at its boundary.
		View: (props: ViewProps) => {
			mockViews.push(props);
			return <actual.View {...props} />;
		},
		Pressable: (props: PressableProps) => {
			mockScrimProps.push(props);
			return <actual.Pressable {...props} />;
		},
	};
});
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 20, bottom: 34, left: 12, right: 12 }),
}));
jest.mock('../keyboard-controller', () => ({
	KeyboardAvoidingView: jest.requireMock('react-native').View,
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('react-native-reanimated', () => {
	const started: { toValue: unknown; callback?: (finished: boolean) => void }[] = [];
	const pending: ((finished: boolean) => void)[] = [];
	return {
		__esModule: true,
		default: {
			View: (props: ViewProps & { entering?: unknown; exiting?: unknown }) => {
				mockAnimatedViews.push(props);
				return <div>{props.children}</div>;
			},
		},
		Easing: { bezier: () => (value: number) => value },
		...Object.fromEntries(
			[
				'FadeIn',
				'FadeOut',
				'SlideInLeft',
				'SlideOutLeft',
				'SlideInRight',
				'SlideOutRight',
				'SlideInDown',
				'SlideOutDown',
			].map((name) => [
				name,
				{
					duration() {
						return this;
					},
				},
			])
		),
		__started: started,
		__pending: pending,
		cancelAnimation: () => pending.splice(0).forEach((callback) => callback(false)),
		useAnimatedStyle: () => ({}),
		useSharedValue: (value: unknown) => ({ value }),
		withSequence: (...animations: unknown[]) => animations,
		withTiming: (toValue: unknown, _config: unknown, callback?: (finished: boolean) => void) => {
			started.push({ toValue, callback });
			if (callback) pending.push(callback);
			return toValue;
		},
	};
});
jest.mock('react-native-worklets', () => ({
	scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));

beforeEach(() => {
	mockViews.length = 0;
	mockScrimProps.length = 0;
	mockAnimatedViews.length = 0;
});

it.each([true, false])('pins a real root wrapper only when pinned=%s', (pinned) => {
	const { container } = render(
		<OverlayShell presentation="right" open pinned={pinned} Scrim={Pressable} testID="d">
			<View testID="panel" />
		</OverlayShell>
	);
	const wrappers = mockViews.filter((props) => props.collapsable === false);
	expect(wrappers).toHaveLength(pinned ? 1 : 0);
	expect(mockViews[0].collapsable).toBe(pinned ? false : undefined);
	expect(StyleSheet.flatten(mockViews[0].style)).toMatchObject(StyleSheet.absoluteFill);
	expect(container.firstElementChild).toBe(screen.getByTestId('d-scrim').parentElement);
	expect(container.firstElementChild).toContainElement(screen.getByTestId('panel'));
});

it('keeps the panel outside the hidden sibling scrim', () => {
	render(
		<OverlayShell presentation="right" open Scrim={Pressable} testID="d">
			<View testID="panel" />
		</OverlayShell>
	);
	const scrim = screen.getByTestId('d-scrim');
	expect(scrim).not.toContainElement(screen.getByTestId('panel'));
	expect(scrim).toBeEmptyDOMElement();
	expect(mockScrimProps.at(-1)?.children).toBeUndefined();
});

function Probe() {
	const { deferAutoFocus } = useOverlay();
	return <View testID="probe" {...{ dataSet: { defer: String(deferAutoFocus) } }} />;
}

it.each(Object.keys(OVERLAY_MOTION) as OverlayPresentation[])(
	'%s configures native insets, accessibility, keyboard and panel motion',
	(presentation) => {
		const { container } = render(
			<OverlayShell presentation={presentation} open Scrim={Pressable} testID="d">
				<Probe />
			</OverlayShell>
		);
		const scrim = mockScrimProps.at(-1)!;
		expect(scrim).toMatchObject({
			accessible: false,
			importantForAccessibility: 'no',
			accessibilityElementsHidden: true,
		});
		expect(scrim.onPress).toBeUndefined();
		expect(scrim.style).toBe(StyleSheet.absoluteFill);
		expect(StyleSheet.flatten(mockViews[0].style)).toMatchObject({
			paddingTop: 20,
			paddingBottom: 34,
			paddingLeft: 12,
			paddingRight: 12,
		});
		expect(container.firstElementChild).toHaveStyle({
			paddingTop: '20px',
			paddingBottom: '34px',
			paddingLeft: '12px',
			paddingRight: '12px',
		});
		const fullHeight = ['left', 'right', 'page'].includes(presentation);
		expect(mockViews).toContainEqual(
			expect.objectContaining({
				behavior: 'padding',
				keyboardVerticalOffset: 34,
				className: fullHeight ? 'h-full' : undefined,
				pointerEvents: 'box-none',
			})
		);
		const panel = mockAnimatedViews.at(-1)!;
		expect(panel.pointerEvents).toBe('box-none');
		expect(panel.entering).toBe(OVERLAY_MOTION[presentation].entering);
		expect(panel.exiting).toBe(OVERLAY_MOTION[presentation].exiting);
		expect(panel.className?.split(' ')).toEqual(
			expect.arrayContaining(['max-h-full', 'max-w-full'])
		);
		expect(panel.className?.split(' ').includes('h-full')).toBe(fullHeight);
		expect(screen.getByTestId('probe')).toHaveAttribute('data-defer', 'false');
	}
);
