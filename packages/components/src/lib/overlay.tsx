import * as React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import Animated, {
	FadeIn,
	FadeOut,
	SlideInDown,
	SlideInLeft,
	SlideInRight,
	SlideOutDown,
	SlideOutLeft,
	SlideOutRight,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAvoidingView } from '../keyboard-controller';
import { OVERLAY_FADE, PANEL_SLIDE, PANEL_SLIDE_OUT, SHEET_RISE } from './motion';
import { cn } from './utils';
const isWeb = Platform.OS === 'web';
export type OverlayPresentation = 'center' | 'left' | 'right' | 'bottom' | 'page';
export type OverlayScrimComponent = React.ComponentType<any>;
export type OverlayShellProps = {
	presentation: OverlayPresentation;
	open: boolean;
	Scrim: OverlayScrimComponent;
	pinned?: boolean;
	testID?: string;
	children: React.ReactNode;
};
export type OverlayContextValue = {
	presentation: OverlayPresentation;
	deferAutoFocus: boolean;
	onPanelNode: (node: HTMLElement | null) => void;
};
const OverlayContext = React.createContext<OverlayContextValue | undefined>(undefined);
export function useOverlay(): OverlayContextValue {
	const context = React.useContext(OverlayContext);
	if (!context) throw new Error('useOverlay must be used within an OverlayShell');
	return context;
}
export const OVERLAY_MOTION: Record<
	OverlayPresentation,
	{
		enter: string;
		exit: string;
		entering: NonNullable<React.ComponentProps<typeof Animated.View>['entering']>;
		exiting: NonNullable<React.ComponentProps<typeof Animated.View>['exiting']>;
	}
> = {
	center: {
		enter: 'web:animate-dialog-in',
		exit: 'web:animate-dialog-out',
		entering: FadeIn.duration(OVERLAY_FADE),
		exiting: FadeOut.duration(OVERLAY_FADE),
	},
	left: {
		enter: 'web:animate-panel-in-left',
		exit: 'web:animate-panel-out-left',
		entering: SlideInLeft.duration(PANEL_SLIDE),
		exiting: SlideOutLeft.duration(PANEL_SLIDE_OUT),
	},
	right: {
		enter: 'web:animate-panel-in-right',
		exit: 'web:animate-panel-out-right',
		entering: SlideInRight.duration(PANEL_SLIDE),
		exiting: SlideOutRight.duration(PANEL_SLIDE_OUT),
	},
	bottom: {
		enter: 'web:animate-sheet-in',
		exit: 'web:animate-sheet-out',
		entering: SlideInDown.duration(SHEET_RISE),
		exiting: SlideOutDown.duration(PANEL_SLIDE_OUT),
	},
	page: {
		enter: 'web:animate-panel-in-right',
		exit: 'web:animate-panel-out-right',
		entering: SlideInRight.duration(PANEL_SLIDE),
		exiting: SlideOutRight.duration(PANEL_SLIDE_OUT),
	},
};
const align: Record<OverlayPresentation, string> = {
	center: 'items-center justify-center p-2',
	right: 'flex-row justify-end items-stretch p-0',
	left: 'flex-row justify-start items-stretch p-0',
	bottom: 'flex-col justify-end items-stretch p-0',
	page: 'flex-row items-stretch justify-start p-0',
};
const TEXT_FIELD =
	'input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled])';
const TABBABLE = `a[href],button:not([disabled]),${TEXT_FIELD},[tabindex]:not([tabindex="-1"])`;
/**
 * Web only, side panels only. Radix focuses the first tabbable the moment the content
 * mounts, while `slide-in-from-*` still has the panel translated a full width off-screen.
 * The browser then scrolls the nearest scrollable ancestor (in the POS that is a
 * react-native-screens wrapper) to reveal the focused element, and the whole screen
 * lurches sideways as the animation brings the panel back. So: cancel the mount-time
 * autofocus and focus the first field — without scrolling — once the animation ends.
 *
 * Takes the node as STATE, not a ref: a trigger-opened dialog's content mounts one
 * render after `open` flips (Radix Presence), so a ref is still null when an effect
 * keyed on `open` runs, and that effect would never re-run.
 */
export function OverlayShell(props: OverlayShellProps): React.JSX.Element {
	const { presentation, open, Scrim, pinned, testID, children } = props;
	const insets = useSafeAreaInsets();
	const [node, onPanelNode] = React.useState<HTMLElement | null>(null);
	const fullHeight = presentation === 'left' || presentation === 'right' || presentation === 'page';
	const deferAutoFocus = isWeb && fullHeight;
	// The external animation event (or reduced-motion timer) determines when focus is safe.
	React.useEffect(() => {
		if (!isWeb || presentation === 'center' || presentation === 'bottom' || !open || !node) return;
		let done = false;
		const focusFirst = () => {
			if (done) return;
			done = true;
			if (node.contains(document.activeElement)) return;
			const target =
				node.querySelector<HTMLElement>(TEXT_FIELD) ??
				node.querySelector<HTMLElement>(TABBABLE) ??
				node;
			target.focus({ preventScroll: true });
		};
		const onAnimationEnd = (event: AnimationEvent) => {
			if (event.target === node) focusFirst();
		};
		node.addEventListener('animationend', onAnimationEnd);
		// Reduced-motion or a missing keyframe never fires animationend; the timer covers it.
		const timer = setTimeout(focusFirst, PANEL_SLIDE + 50);
		return () => {
			done = true;
			clearTimeout(timer);
			node.removeEventListener('animationend', onAnimationEnd);
		};
	}, [node, open, presentation]);
	const shell = isWeb ? (
		<Scrim
			className={cn(
				'bg-scrim absolute top-0 right-0 bottom-0 left-0 flex',
				align[presentation],
				open ? 'web:animate-overlay-in' : 'web:animate-overlay-out',
				// Radix inserts an auto-height [role=dialog] wrapper; flatten it so the panel's h-full / max-h-[92%] resolve against the overlay (dialog ledger line 5).
				presentation !== 'center' && '[&>[role=dialog]]:contents'
			)}
			// The scrim is a Pressable, so RN-web would give it tabIndex=0 and the click that
			// opened the dialog can land on it and focus it. A focus during a side panel's
			// enter animation scrolls the nearest scrollable ancestor (see focusAfterSlideIn).
			focusable={false}
			testID={testID ? `${testID}-scrim` : undefined}
		>
			{children}
		</Scrim>
	) : (
		<Scrim
			style={[StyleSheet.absoluteFill, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
			className={cn('bg-scrim flex', align[presentation])}
			accessible={false}
			importantForAccessibility="no"
			accessibilityElementsHidden
			testID={testID ? `${testID}-scrim` : undefined}
		>
			<KeyboardAvoidingView
				behavior="padding"
				keyboardVerticalOffset={insets.bottom}
				className={fullHeight ? 'h-full' : undefined}
			>
				<Animated.View
					entering={OVERLAY_MOTION[presentation].entering}
					exiting={OVERLAY_MOTION[presentation].exiting}
					className={cn('max-h-full max-w-full', fullHeight && 'h-full')}
				>
					{children}
				</Animated.View>
			</KeyboardAvoidingView>
		</Scrim>
	);
	/**
	 * `collapsable={false}` below is load-bearing on Android/Fabric, not a style choice.
	 * This scrim is the screen's root view. Until its background lands it is layout-only,
	 * so Fabric flattens it away and mounts its child straight into RNSScreenContentWrapper;
	 * the commit that gives it a background un-flattens it, and Fabric then re-parents that
	 * child into the newly created view. A re-parent inside a screen that react-native-screens
	 * has put into a removal transition is fatal: `Screen.startRemovalTransition()` calls
	 * `startViewTransition()` on every descendant, so Android leaves `mParent` set on
	 * `removeView` and the follow-up insert throws "View already has a parent"
	 * (software-mansion/react-native-screens#3249). The POS checkout -> receipt
	 * `router.replace` hits exactly that window. Pinning the view means there is no
	 * re-parent to defeat.
	 */
	return (
		<OverlayContext.Provider value={{ presentation, deferAutoFocus, onPanelNode }}>
			{pinned ? (
				<View collapsable={false} style={StyleSheet.absoluteFill}>
					{shell}
				</View>
			) : (
				shell
			)}
		</OverlayContext.Provider>
	);
}
