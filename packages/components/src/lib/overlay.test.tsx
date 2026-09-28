import * as React from 'react';
import { Pressable, type PressableProps, View } from 'react-native';

import { act, render, screen } from '@testing-library/react';

import { BEATS, INDETERMINATE, SPINNER, WEB_ANIMATIONS } from './motion';
import {
	OVERLAY_MOTION,
	OVERLAY_PANEL,
	type OverlayPresentation,
	OverlaySheetPanel,
	OverlayShell,
	useOverlay,
	useOverlayPresentation,
} from './overlay';

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

it('names the functional wait beats and the web progress sweep', () => {
	expect(SPINNER).toBe(1000);
	expect(INDETERMINATE).toBe(1100);
	expect(BEATS.spinner.duration).toBe(SPINNER);
	expect(BEATS.indeterminateProgress.duration).toBe(INDETERMINATE);
	expect(WEB_ANIMATIONS['indeterminate']).toContain('1100ms');
});

it('leaves anchored positioning to the primitive without deferring focus', () => {
	render(
		<OverlayShell presentation="anchored" open Scrim={Pressable} testID="anchor">
			<Probe />
		</OverlayShell>
	);
	expect(mockScrimProps.at(-1)?.className).toBeUndefined();
	expect(mockScrimProps.at(-1)?.focusable).toBe(false);
	expect(screen.getByTestId('probe').parentElement).toBe(screen.getByTestId('anchor-scrim'));
	expect(screen.getByTestId('probe')).toHaveAttribute('data-defer', 'false');
	expect(OVERLAY_MOTION.anchored.enter).toBe('web:animate-pop-in');
	expect(OVERLAY_MOTION.anchored.exit).toBe('web:animate-pop-out');
	expect(OVERLAY_PANEL.anchored).toContain('bg-card');
	expect(OVERLAY_PANEL.anchored).toContain('shadow-md');
	expect(OVERLAY_PANEL.bottom).toContain('rounded-t-2xl');
	expect(OVERLAY_PANEL.bottom).not.toContain('shadow');
});

it('offers an optional presentation without exporting the context', () => {
	const values: (string | undefined)[] = [];
	function OptionalProbe() {
		values.push(useOverlayPresentation());
		return null;
	}
	render(
		<>
			<OptionalProbe />
			<OverlayShell presentation="bottom" open Scrim={Pressable}>
				<OptionalProbe />
			</OverlayShell>
		</>
	);
	expect(values).toEqual([undefined, 'bottom']);
});

it('hands a sheet dismiss to the web scrim as its press, and nothing when unset', () => {
	const onDismiss = jest.fn();
	render(
		<OverlayShell presentation="bottom" open Scrim={Pressable} onDismiss={onDismiss} testID="s">
			<Probe />
		</OverlayShell>
	);
	mockScrimProps.at(-1)?.onPress?.({} as never);
	expect(onDismiss).toHaveBeenCalledTimes(1);
	render(
		<OverlayShell presentation="anchored" open Scrim={Pressable} onDismiss={onDismiss} testID="a">
			<Probe />
		</OverlayShell>
	);
	mockScrimProps.at(-1)?.onPress?.({} as never);
	expect(onDismiss).toHaveBeenCalledTimes(2);
});

it('dismisses on the backdrop only: a press bubbling up from the panel is ignored', () => {
	const onDismiss = jest.fn();
	render(
		<OverlayShell presentation="bottom" open Scrim={Pressable} onDismiss={onDismiss} testID="b">
			<Probe />
		</OverlayShell>
	);
	const scrim = {};
	const panel = {};
	mockScrimProps.at(-1)?.onPress?.({ target: panel, currentTarget: scrim } as never);
	expect(onDismiss).not.toHaveBeenCalled();
	mockScrimProps.at(-1)?.onPress?.({ target: scrim, currentTarget: scrim } as never);
	expect(onDismiss).toHaveBeenCalledTimes(1);
});

it('closes a sheet that owns its dismiss on Escape, and leaves the key alone otherwise', () => {
	const onDismiss = jest.fn();
	const { unmount } = render(
		<OverlayShell presentation="bottom" open Scrim={Pressable} onDismiss={onDismiss} testID="e">
			<Probe />
		</OverlayShell>
	);
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
	expect(onDismiss).toHaveBeenCalledTimes(1);
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
	expect(onDismiss).toHaveBeenCalledTimes(1);
	unmount();
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
	expect(onDismiss).toHaveBeenCalledTimes(1);
	const quiet = jest.fn();
	render(
		<OverlayShell presentation="bottom" open Scrim={Pressable} testID="q">
			<Probe />
		</OverlayShell>
	);
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
	expect(quiet).not.toHaveBeenCalled();
});

it('hands the keys to the newest sheet: Escape closes the one opened from a sheet, then the sheet', () => {
	const closeOuter = jest.fn();
	const closeInner = jest.fn();
	render(
		<OverlayShell presentation="bottom" open Scrim={Pressable} onDismiss={closeOuter} testID="o">
			<Probe />
		</OverlayShell>
	);
	const inner = render(
		<OverlayShell presentation="bottom" open Scrim={Pressable} onDismiss={closeInner} testID="i">
			<Probe />
		</OverlayShell>
	);
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
	expect(closeInner).toHaveBeenCalledTimes(1);
	expect(closeOuter).not.toHaveBeenCalled();
	inner.unmount();
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
	expect(closeOuter).toHaveBeenCalledTimes(1);
	expect(closeInner).toHaveBeenCalledTimes(1);
});

it('focuses the first field of a sheet that owns its dismiss once the rise settles', () => {
	jest.useFakeTimers();
	try {
		render(
			<OverlayShell presentation="bottom" open Scrim={Pressable} onDismiss={jest.fn()} testID="s">
				<OverlaySheetPanel testID="sheet" className="w-80">
					<input data-testid="field" />
				</OverlaySheetPanel>
			</OverlayShell>
		);
		// The panel's classes are pinned in popover.test.tsx (this harness drops them); the
		// focus hand-off is the shell's and is pinned here.
		const sheet = screen.getByTestId('sheet');
		expect(document.activeElement).not.toBe(screen.getByTestId('field'));
		act(() => {
			sheet.dispatchEvent(new Event('animationend', { bubbles: false }));
		});
		expect(document.activeElement).toBe(screen.getByTestId('field'));
	} finally {
		jest.useRealTimers();
	}
});

it('is a dialog that hands focus back to its opener when a sheet that owns its dismiss closes', () => {
	const opener = document.createElement('button');
	document.body.appendChild(opener);
	opener.focus();
	try {
		const { rerender } = render(
			<OverlayShell presentation="bottom" open Scrim={Pressable} onDismiss={jest.fn()} testID="r">
				<OverlaySheetPanel testID="sheet">
					<input data-testid="field" />
				</OverlaySheetPanel>
			</OverlayShell>
		);
		const sheet = screen.getByTestId('sheet');
		expect(sheet).toHaveAttribute('role', 'dialog');
		act(() => {
			sheet.dispatchEvent(new Event('animationend'));
		});
		expect(document.activeElement).toBe(screen.getByTestId('field'));
		rerender(
			<OverlayShell
				presentation="bottom"
				open={false}
				Scrim={Pressable}
				onDismiss={jest.fn()}
				testID="r"
			>
				<OverlaySheetPanel testID="sheet">
					<input data-testid="field" />
				</OverlaySheetPanel>
			</OverlayShell>
		);
		expect(document.activeElement).toBe(opener);
	} finally {
		opener.remove();
	}
});

it('keeps Tab inside a sheet that owns its dismiss, wrapping at either end', () => {
	render(
		<OverlayShell presentation="bottom" open Scrim={Pressable} onDismiss={jest.fn()} testID="t">
			<OverlaySheetPanel testID="sheet">
				<input data-testid="first" />
				<input data-testid="last" />
			</OverlaySheetPanel>
		</OverlayShell>
	);
	expect(screen.getByTestId('sheet')).toHaveAttribute('tabindex', '-1');
	const tab = (shiftKey: boolean) => {
		const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true });
		document.dispatchEvent(event);
		return event.defaultPrevented;
	};
	screen.getByTestId('last').focus();
	expect(tab(false)).toBe(true);
	expect(document.activeElement).toBe(screen.getByTestId('first'));
	expect(tab(true)).toBe(true);
	expect(document.activeElement).toBe(screen.getByTestId('last'));
	screen.getByTestId('first').focus();
	expect(tab(false)).toBe(false);
	(document.activeElement as HTMLElement).blur();
	expect(tab(false)).toBe(true);
	expect(document.activeElement).toBe(screen.getByTestId('first'));
});
