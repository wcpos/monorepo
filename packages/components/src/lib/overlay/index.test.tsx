import * as React from 'react';
import { Pressable, type PressableProps, View } from 'react-native';

import { act, render, screen } from '@testing-library/react';

import { EdgeSurface, TitleBarStripProvider } from '../../edge-surface';
import { BEATS, INDETERMINATE, SPINNER, WEB_ANIMATIONS } from '../motion';
import {
	OVERLAY_MOTION,
	OVERLAY_PANEL,
	type OverlayPresentation,
	OverlaySheetPanel,
	OverlayShell,
	SCRIM_WRAPPER,
	useOverlay,
	useOverlayPresentation,
	useSheetInset,
} from './index';

// Jest resolves the native stub; the web overlay mounts the Radix scope, so this harness does too.
jest.mock('./sheet-focus-scope', () => jest.requireActual('./sheet-focus-scope.web'));
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
const mockUseKeyboardState = jest.fn();
jest.mock('../../keyboard-controller', () => ({
	KeyboardAvoidingView: jest.requireMock('react-native').View,
	useKeyboardState: (...args: unknown[]) => mockUseKeyboardState(...args),
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
	// The Radix wrapper is a real box, never `display: contents`: flattened, no descendant
	// of the panel can start a native HTML5 drag (column reorder in every settings panel).
	expect(classes).toEqual(expect.arrayContaining(SCRIM_WRAPPER[presentation].split(' ')));
	expect(classes?.join(' ')).not.toMatch(/:contents\b/);
	expect(mockScrimProps.at(-1)).toMatchObject({ focusable: false });
	expect(mockScrimProps.at(-1)?.onPress).toBeUndefined();
});

// The desktop title bar is a thing apart, above every overlay: the scrim starts under it (Paul,
// 2026-10-29). A portalled shell is laid out from the window's top, so it takes the whole strip even
// when opened from inside the POS ground (its context says the strip is padded); an inline one (a
// route dialog) is laid out inside that ground and takes only what is still owed. No strip, no offset.
it.each([
	['portalled', 28, false, false, { top: 28 }],
	['portalled from a padded ground', 28, false, true, { top: 28 }],
	['inline', 28, true, false, { top: 28 }],
	['inline in a padded ground', 28, true, true, undefined],
	['portalled without a strip', 0, false, false, undefined],
	['inline without a strip', 0, true, false, undefined],
] as const)('%s with a strip of %s gives the scrim %#', (_case, height, inline, padded, style) => {
	const shell = (
		<OverlayShell presentation="right" open Scrim={Pressable} inline={inline} testID="d">
			<Probe />
		</OverlayShell>
	);
	render(
		<TitleBarStripProvider value={{ node: null, height }}>
			{padded ? <EdgeSurface edges={['strip']}>{shell}</EdgeSurface> : shell}
		</TitleBarStripProvider>
	);
	expect(mockScrimProps.at(-1)?.style).toEqual(style);
});

it('marks the phone sheet out of the scrim rule that flattens a Radix wrapper', () => {
	// The sheet panel is the box itself: flattened to display:contents it measured 0×0 in the
	// app and its rows spilled over the page (every popover-family sheet on phone, 2026-09-29).
	render(
		<OverlayShell presentation="bottom" open Scrim={Pressable} onDismiss={jest.fn()} testID="m">
			<OverlaySheetPanel testID="sheet">
				<View />
			</OverlaySheetPanel>
		</OverlayShell>
	);
	const sheet = screen.getByTestId('sheet');
	expect(sheet).toHaveAttribute('role', 'dialog');
	expect(sheet).toHaveAttribute('data-sheet');
});

it('keeps the phone sheet style array through its focus scope', () => {
	// The scope's Slot spreads the panel's style: an RN array became `{0, 1}`, the DOM refused
	// the indexed keys and the combobox gallery pages rendered nothing (#2995, gallery shards).
	render(
		<OverlayShell presentation="bottom" open Scrim={Pressable} onDismiss={jest.fn()} testID="m">
			<OverlaySheetPanel testID="sheet" style={{ width: 320 }}>
				<View />
			</OverlaySheetPanel>
		</OverlayShell>
	);
	expect(screen.getByTestId('sheet')).toHaveStyle({ width: '320px' });
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

it('lets a blocking scrim keep its clicks on web, where the panel sits inside it', () => {
	function InsetProbe() {
		return <View testID="inset" {...{ dataSet: { inset: String(useSheetInset(16)) } }} />;
	}
	render(
		<OverlayShell presentation="bottom" open Scrim={Pressable} blocking testID="b">
			<InsetProbe />
		</OverlayShell>
	);
	expect(mockScrimProps.at(-1)?.pointerEvents).toBeUndefined();
	// Web has no keyboard wrapper and never reads the keyboard's state.
	expect(mockUseKeyboardState).not.toHaveBeenCalled();
	// Web pads nothing: the inset is a native sheet's.
	expect(screen.getByTestId('inset')).toHaveAttribute('data-inset', 'undefined');
});

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
	// Flat: a hairline border carries the panel, no shadow (decision 11, CODING_STANDARDS § Design 7).
	expect(OVERLAY_PANEL.anchored).toContain('border');
	expect(OVERLAY_PANEL.anchored).not.toContain('shadow');
	expect(OVERLAY_PANEL.bottom).toContain('rounded-t-2xl');
	expect(OVERLAY_PANEL.bottom).not.toContain('shadow');
	// Web: SCRIM_WRAPPER skips a `[data-sheet]`, so the sheet panel keeps its own cap.
	expect(OVERLAY_PANEL.bottom).toContain('max-h-[92%]');
	expect(OVERLAY_PANEL.bottom).not.toContain('max-h-full');
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

it('ignores fill on web, keeping the scrim and wrappers and exposing fill: false', () => {
	const seen: unknown[] = [];
	function FillProbe() {
		seen.push(useOverlay());
		return <View testID="fill-probe" />;
	}
	const shell = (fill: boolean) => (
		<OverlayShell presentation="center" open fill={fill} Scrim={Pressable} testID="f">
			<FillProbe />
		</OverlayShell>
	);
	const { container, rerender } = render(shell(false));
	const before = container.innerHTML;
	const classes = mockScrimProps.at(-1)?.className;
	rerender(shell(true));
	expect(mockScrimProps.at(-1)?.className).toBe(classes);
	expect(classes?.split(' ')).toEqual(
		expect.arrayContaining(['bg-scrim', 'items-center', 'justify-center', 'p-2'])
	);
	expect(classes).toContain(SCRIM_WRAPPER.center);
	expect(container.innerHTML).toBe(before);
	expect(screen.getByTestId('fill-probe').parentElement).toBe(screen.getByTestId('f-scrim'));
	expect(seen.at(-1)).toMatchObject({ fill: false });
});
