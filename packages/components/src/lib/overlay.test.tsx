import * as React from 'react';
import { Pressable, type PressableProps, View } from 'react-native';

import { render, screen } from '@testing-library/react';

import { WEB_ANIMATIONS } from './motion';
import { OVERLAY_MOTION, type OverlayPresentation, OverlayShell, useOverlay } from './overlay';

const mockScrimProps: PressableProps[] = [];
jest.mock('react-native', () => {
	const actual = jest.requireActual<typeof import('react-native')>('react-native');
	return {
		...actual,
		// Record classes before RN-web drops them in this harness without Uniwind.
		Pressable: (props: PressableProps) => {
			mockScrimProps.push(props);
			return <actual.Pressable {...props} />;
		},
	};
});
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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
		default: { View: ({ children }: React.PropsWithChildren) => <div>{children}</div> },
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
					easing: jest.fn().mockReturnThis(),
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

function Probe() {
	const { presentation, deferAutoFocus } = useOverlay();
	return <View testID="probe" {...{ dataSet: { presentation, defer: String(deferAutoFocus) } }} />;
}

beforeEach(() => {
	mockScrimProps.length = 0;
});

it.each([
	['center', 'items-center justify-center p-2', false],
	['right', 'flex-row justify-end items-stretch p-0', true],
	['left', 'flex-row justify-start items-stretch p-0', true],
	['bottom', 'flex-col justify-end items-stretch p-0', false],
	['page', 'flex-row items-stretch justify-start p-0', true],
] as const)('aligns %s and supplies its focus policy', (presentation, alignment, deferred) => {
	render(
		<OverlayShell presentation={presentation} open Scrim={Pressable} testID="d">
			<Probe />
		</OverlayShell>
	);
	expect(screen.getByTestId('d-scrim')).toBeInTheDocument();
	const classes = mockScrimProps.at(-1)?.className?.split(' ');
	expect(classes).toEqual(expect.arrayContaining(alignment.split(' ')));
	expect(classes).toContain('bg-scrim');
	expect(classes).toContain('web:animate-overlay-in');
	expect(screen.getByTestId('probe')).toHaveAttribute('data-presentation', presentation);
	expect(screen.getByTestId('probe')).toHaveAttribute('data-defer', String(deferred));
	expect(classes).toContain('[&>[role=dialog]]:contents');
	expect(mockScrimProps.at(-1)).toMatchObject({ focusable: false });
	expect(mockScrimProps.at(-1)?.onPress).toBeUndefined();
});

it('provides a fallback scrim test ID', () => {
	render(
		<OverlayShell presentation="center" open Scrim={Pressable}>
			<View />
		</OverlayShell>
	);
	expect(screen.getByTestId('overlay-scrim')).toBeInTheDocument();
});

it('uses the scrim exit animation when closed', () => {
	render(
		<OverlayShell presentation="center" open={false} Scrim={Pressable}>
			<View />
		</OverlayShell>
	);
	expect(mockScrimProps.at(-1)?.className?.split(' ')).toContain('web:animate-overlay-out');
});

it('requires a shell for useOverlay', () => {
	expect(() => render(<Probe />)).toThrow('useOverlay must be used within an OverlayShell');
});

it.each(Object.keys(OVERLAY_MOTION) as OverlayPresentation[])(
	'%s uses registered web animation tokens',
	(presentation) => {
		for (const animation of [
			OVERLAY_MOTION[presentation].enter,
			OVERLAY_MOTION[presentation].exit,
		]) {
			expect(animation).toMatch(/^web:animate-/);
			expect(WEB_ANIMATIONS).toHaveProperty(animation.replace('web:animate-', ''));
		}
	}
);
