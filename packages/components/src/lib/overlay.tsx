import * as React from 'react';
import {
	AccessibilityInfo,
	BackHandler,
	findNodeHandle,
	type GestureResponderEvent,
	Platform,
	type StyleProp,
	StyleSheet,
	View,
	type ViewStyle,
} from 'react-native';

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
import {
	EASE,
	OVERLAY_FADE,
	PANEL_SLIDE,
	PANEL_SLIDE_OUT,
	POPOVER_FADE,
	SHEET_RISE,
} from './motion';
import { cn } from './utils';
const isWeb = Platform.OS === 'web';
export type OverlayPresentation = 'center' | 'left' | 'right' | 'bottom' | 'page' | 'anchored';
export type OverlayScrimProps = {
	children?: React.ReactNode;
	className?: string;
	style?: StyleProp<ViewStyle>;
	testID?: string;
	focusable?: boolean;
	accessible?: boolean;
	importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
	accessibilityElementsHidden?: boolean;
	onPress?: (event: GestureResponderEvent) => void;
};
export type OverlayScrimComponent = React.ComponentType<OverlayScrimProps>;
export type OverlayShellProps = {
	presentation: OverlayPresentation;
	open: boolean;
	Scrim: OverlayScrimComponent;
	/**
	 * A sheet's own dismiss, for a panel that mounts no primitive `Content`: on web the
	 * popover-family `Overlay` is a bare Pressable, so a press on the backdrop itself (not
	 * one bubbling up from the panel) calls it; on native the hardware back and the
	 * accessibility escape call it, the jobs `Content` would have done. Radix dialog
	 * overlays and every native `Overlay` already dismiss on a press: leave it unset there.
	 */
	onDismiss?: () => void;
	pinned?: boolean;
	testID?: string;
	children: React.ReactNode;
};
export type OverlayContextValue = {
	presentation: OverlayPresentation;
	open: boolean;
	deferAutoFocus: boolean;
	onPanelNode: (node: HTMLElement | null) => void;
};
const OverlayContext = React.createContext<OverlayContextValue | undefined>(undefined);
export function useOverlay(): OverlayContextValue {
	const context = React.useContext(OverlayContext);
	if (!context) throw new Error('useOverlay must be used within an OverlayShell');
	return context;
}
export function useOverlayPresentation(): OverlayPresentation | undefined {
	return React.useContext(OverlayContext)?.presentation;
}
export const OVERLAY_PANEL = {
	anchored: 'bg-card border-border rounded-lg border p-2 shadow-md',
	bottom: 'bg-card border-border w-full max-h-[92%] rounded-t-2xl border-t p-2',
};
export const OVERLAY_MOTION: Record<
	OverlayPresentation,
	{
		enter: string;
		exit: string;
		entering: NonNullable<React.ComponentProps<typeof Animated.View>['entering']>;
		exiting: NonNullable<React.ComponentProps<typeof Animated.View>['exiting']>;
	}
> = {
	anchored: {
		enter: 'web:animate-pop-in',
		exit: 'web:animate-pop-out',
		entering: FadeIn.duration(POPOVER_FADE).easing(EASE),
		exiting: FadeOut.duration(POPOVER_FADE).easing(EASE),
	},
	center: {
		enter: 'web:animate-dialog-in',
		exit: 'web:animate-dialog-out',
		entering: FadeIn.duration(OVERLAY_FADE).easing(EASE),
		exiting: FadeOut.duration(OVERLAY_FADE).easing(EASE),
	},
	left: {
		enter: 'web:animate-panel-in-left',
		exit: 'web:animate-panel-out-left',
		entering: SlideInLeft.duration(PANEL_SLIDE).easing(EASE),
		exiting: SlideOutLeft.duration(PANEL_SLIDE_OUT).easing(EASE),
	},
	right: {
		enter: 'web:animate-panel-in-right',
		exit: 'web:animate-panel-out-right',
		entering: SlideInRight.duration(PANEL_SLIDE).easing(EASE),
		exiting: SlideOutRight.duration(PANEL_SLIDE_OUT).easing(EASE),
	},
	bottom: {
		enter: 'web:animate-sheet-in',
		exit: 'web:animate-sheet-out',
		entering: SlideInDown.duration(SHEET_RISE).easing(EASE),
		exiting: SlideOutDown.duration(PANEL_SLIDE_OUT).easing(EASE),
	},
	page: {
		enter: 'web:animate-panel-in-right',
		exit: 'web:animate-panel-out-right',
		entering: SlideInRight.duration(PANEL_SLIDE).easing(EASE),
		exiting: SlideOutRight.duration(PANEL_SLIDE_OUT).easing(EASE),
	},
};
/**
 * The phone sheet's panel for an overlay that mounts no primitive `Content` (the popover
 * family under the phone width): the drawn sheet skin, the rise from `open`, the caller's
 * classes first so the sheet's geometry wins, and the node handed to the shell so it can
 * focus the first field once the rise settles.
 */
export function OverlaySheetPanel({
	className,
	style,
	testID,
	children,
}: {
	className?: string;
	style?: StyleProp<ViewStyle>;
	testID?: string;
	children: React.ReactNode;
}) {
	const { open, onPanelNode } = useOverlay();
	const setNode = React.useCallback(
		(panel: View | null) => {
			onPanelNode(panel as unknown as HTMLElement | null);
			// Native: the primitive Content moved accessibility focus into itself on open; the sheet does the same.
			if (isWeb || !panel) return;
			const tag = findNodeHandle(panel);
			if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
		},
		[onPanelNode]
	);
	return (
		<View
			ref={setNode}
			role="dialog"
			aria-modal
			testID={testID}
			className={cn(
				className,
				OVERLAY_PANEL.bottom,
				open ? OVERLAY_MOTION.bottom.enter : OVERLAY_MOTION.bottom.exit,
				'z-50'
			)}
			style={style}
		>
			{children}
		</View>
	);
}
const align: Record<OverlayPresentation, string> = {
	anchored: '',
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
 * Web only, side panels and the sheets that own their dismiss. Radix focuses the first tabbable the moment the content
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
	const { presentation, open, Scrim, onDismiss, pinned, testID, children } = props;
	const insets = useSafeAreaInsets();
	const [node, onPanelNode] = React.useState<HTMLElement | null>(null);
	const fullHeight = presentation === 'left' || presentation === 'right' || presentation === 'page';
	const deferAutoFocus = isWeb && fullHeight;
	const ownsDismiss = Boolean(onDismiss);
	const onDismissRef = React.useRef(onDismiss);
	React.useEffect(() => {
		onDismissRef.current = onDismiss;
	});
	const onScrimPress = React.useCallback(
		(event?: GestureResponderEvent) => {
			// On web the scrim is the panel's ancestor, so a press inside the panel bubbles
			// here too; only the backdrop itself dismisses.
			if (event?.target && event.currentTarget && event.target !== event.currentTarget) return;
			onDismiss?.();
		},
		[onDismiss]
	);
	React.useEffect(() => {
		if (!open || !ownsDismiss) return;
		if (isWeb) {
			// A sheet without primitive Content has no Radix dismissable layer: Escape is ours.
			const onKey = (event: KeyboardEvent) => {
				if (event.key === 'Escape') onDismissRef.current?.();
			};
			document.addEventListener('keydown', onKey);
			return () => document.removeEventListener('keydown', onKey);
		}
		const back = BackHandler.addEventListener('hardwareBackPress', () => {
			onDismissRef.current?.();
			return true;
		});
		return () => back.remove();
	}, [open, ownsDismiss]);
	// The external animation event (or reduced-motion timer) determines when focus is safe.
	React.useEffect(() => {
		// Side panels, and a sheet that owns its dismiss (no primitive Content to focus it).
		const ownsSheet = presentation === 'bottom' && ownsDismiss;
		if (!isWeb || !open || !node || !(fullHeight || ownsSheet)) return;
		// The primitive Content returned focus to the trigger on close; a sheet that owns its
		// dismiss remembers the opener and hands focus back when it closes or unmounts.
		const opener = ownsSheet ? (document.activeElement as HTMLElement | null) : null;
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
			const active = document.activeElement;
			if (
				opener &&
				opener !== document.body &&
				(!active || active === document.body || node.contains(active))
			) {
				opener.focus({ preventScroll: true });
			}
		};
	}, [node, open, presentation, fullHeight, ownsDismiss]);
	if (presentation === 'anchored') {
		/**
		 * The primitive positions the panel; the shell supplies only the plumbing the
		 * popover family used to carry each on its own. On web that is nothing: the
		 * primitive's `Overlay` is a passthrough and Radix Popper places the content.
		 *
		 * Native: full-bleed + box-none. Unsized, the wrapper measures width×0 — its
		 * absolutely-positioned child still DRAWS (RN doesn't clip), but Android
		 * accessibility intersects every node's bounds with its ancestors', so the entire
		 * popover subtree is pruned from the a11y tree: invisible to TalkBack and to
		 * testID-driven E2E while looking perfect on screen (monorepo#1614; proven via
		 * `dumpsys activity top` showing the wrapper at 0,0-2560,0). box-none keeps
		 * outside-taps falling through to the Overlay's dismiss. Fixed in monorepo#1623
		 * for popover, hover-card, select, select-multi, combobox, tree-combobox and the
		 * dropdown menu; those ledger lines now point here.
		 */
		return (
			<OverlayContext.Provider value={{ presentation, open, deferAutoFocus, onPanelNode }}>
				{isWeb ? (
					<Scrim
						focusable={false}
						onPress={onDismiss ? onScrimPress : undefined}
						testID={testID ? `${testID}-scrim` : 'overlay-scrim'}
					>
						{children}
					</Scrim>
				) : (
					<View style={StyleSheet.absoluteFill} pointerEvents="box-none">
						<Scrim
							style={StyleSheet.absoluteFill}
							accessible={false}
							importantForAccessibility="no"
							accessibilityElementsHidden
							testID={testID ? `${testID}-scrim` : 'overlay-scrim'}
						/>
						<Animated.View
							style={StyleSheet.absoluteFill}
							pointerEvents="box-none"
							onAccessibilityEscape={onDismiss}
							entering={OVERLAY_MOTION.anchored.entering}
							exiting={OVERLAY_MOTION.anchored.exiting}
						>
							{children}
						</Animated.View>
					</View>
				)}
			</OverlayContext.Provider>
		);
	}
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
	const shell = isWeb ? (
		<Scrim
			className={cn(
				'bg-scrim absolute top-0 right-0 bottom-0 left-0 flex',
				align[presentation],
				open ? 'web:animate-overlay-in' : 'web:animate-overlay-out',
				// Radix inserts an auto-height [role=dialog] wrapper; flatten it on every presentation so the panel's h-full / max-h-[92%] / max-w-full resolve against the overlay (dialog ledger line 5).
				'[&>[role=dialog]]:contents'
			)}
			// The scrim is a Pressable, so RN-web would give it tabIndex=0 and the click that
			// opened the dialog can land on it and focus it. A focus during a side panel's
			// enter animation scrolls the nearest scrollable ancestor (see focusAfterSlideIn).
			focusable={false}
			onPress={onDismiss ? onScrimPress : undefined}
			testID={testID ? `${testID}-scrim` : 'overlay-scrim'}
		>
			{children}
		</Scrim>
	) : (
		<View
			collapsable={pinned ? false : undefined}
			style={[
				StyleSheet.absoluteFill,
				{
					paddingTop: insets.top,
					paddingBottom: insets.bottom,
					paddingLeft: insets.left,
					paddingRight: insets.right,
				},
			]}
			className={cn('flex bg-transparent', align[presentation])}
		>
			<Scrim
				style={StyleSheet.absoluteFill}
				className="bg-scrim"
				accessible={false}
				importantForAccessibility="no"
				accessibilityElementsHidden
				testID={testID ? `${testID}-scrim` : 'overlay-scrim'}
			/>
			<KeyboardAvoidingView
				pointerEvents="box-none"
				behavior="padding"
				keyboardVerticalOffset={insets.bottom}
				className={cn('max-h-full max-w-full', fullHeight && 'h-full')}
			>
				<Animated.View
					pointerEvents="box-none"
					onAccessibilityEscape={onDismiss}
					entering={OVERLAY_MOTION[presentation].entering}
					exiting={OVERLAY_MOTION[presentation].exiting}
					className={cn('max-h-full max-w-full', fullHeight && 'h-full')}
				>
					{children}
				</Animated.View>
			</KeyboardAvoidingView>
		</View>
	);
	return (
		<OverlayContext.Provider value={{ presentation, open, deferAutoFocus, onPanelNode }}>
			{isWeb && pinned ? (
				<View collapsable={false} style={StyleSheet.absoluteFill}>
					{shell}
				</View>
			) : (
				shell
			)}
		</OverlayContext.Provider>
	);
}
