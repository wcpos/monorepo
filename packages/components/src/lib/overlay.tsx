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
	type ViewInstance,
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

import { KeyboardAvoidingView, useKeyboardState } from '../keyboard-controller';
import {
	EASE,
	EASE_EXIT,
	OVERLAY_FADE,
	PANEL_SLIDE,
	PANEL_SLIDE_OUT,
	POPOVER_FADE,
	SHEET_RISE,
} from './motion';
import { cn } from './utils';
/** The shell's platform verdict; consumers branch on this, never on `Platform` themselves. */
export const isWeb = Platform.OS === 'web';
/**
 * Web: a closing overlay stays mounted until its exit has played. Radix keeps the portal,
 * the scrim and the panel until the scrim's animation ends, but only while the caller goes
 * on rendering them, and only if the portal can see the scrim: its presence check reads the
 * animation off the node its child hands back, so the shell passes its `ref` on to the
 * scrim. Native's primitives unmount at once and Reanimated plays the exit on the way out.
 */
export const OVERLAY_EXIT_MOUNTED = isWeb;
// Only the native shell has a keyboard wrapper; web never reads the keyboard's state.
const useKeyboardVisible = isWeb ? () => false : () => useKeyboardState((state) => state.isVisible);
export type OverlayPresentation = 'center' | 'left' | 'right' | 'bottom' | 'page' | 'anchored';
export type OverlayScrimProps = {
	ref?: React.Ref<never>;
	children?: React.ReactNode;
	className?: string;
	style?: StyleProp<ViewStyle>;
	testID?: string;
	focusable?: boolean;
	accessible?: boolean;
	importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
	accessibilityElementsHidden?: boolean;
	/** Native: a blocking scrim takes no touches (see `OverlayShellProps.blocking`). */
	pointerEvents?: 'auto' | 'none';
	onPress?: (event: GestureResponderEvent) => void;
};
export type OverlayScrimComponent = React.ComponentType<OverlayScrimProps>;
export type OverlayShellProps = {
	/** Web: handed to the scrim, so the portal above can wait for its exit (see `OVERLAY_EXIT_MOUNTED`). */
	ref?: React.Ref<never>;
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
	/**
	 * Web, anchored: the dismiss for a press outside a non-modal panel. The scrim becomes a
	 * transparent full-screen layer behind the panel that takes the press, so it closes the
	 * panel and reaches nothing underneath (monorepo#2313: closing the footer tax popover
	 * pressed the product tile under the tap). Native's anchored `Overlay` is full-screen
	 * already. Radix still closes on a mouse pointer-down, and the browser drops the click
	 * whose target went with the layer; a touch it leaves to the click, which lands here.
	 */
	onOutsidePress?: () => void;
	/**
	 * A confirmation: the scrim takes no touches on native; on web the panel sits inside the
	 * scrim, so it keeps taking clicks.
	 */
	blocking?: boolean;
	pinned?: boolean;
	/**
	 * Native: a full-size panel IS the screen. The scrim takes the card colour so the inset
	 * bands read as the card, and the keyboard and motion wrappers fill the shell. Web ignores it.
	 */
	fill?: boolean;
	testID?: string;
	children: React.ReactNode;
};
export type OverlayContextValue = {
	/** The shell's decision, so a panel can take its full-size geometry without reading the platform itself. */
	fill: boolean;
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
/**
 * The bottom inset a native phone sheet paints itself, in card colour: the shell leaves that
 * strip unpadded so the scrim never shows as a bar under the sheet (owner, 2026-10-13).
 * `padding` is the panel's own bottom padding on top of the inset. A panel that renders the
 * shell itself (the alert) is outside the shell's context and names its presentation.
 */
export function useSheetInset(
	padding: number,
	presentation?: OverlayPresentation
): { paddingBottom: number } | undefined {
	const insets = useSafeAreaInsets();
	const current = useOverlayPresentation();
	if (isWeb || (presentation ?? current) !== 'bottom') return undefined;
	return { paddingBottom: insets.bottom + padding };
}
/**
 * Web: Radix mounts an auto-sized `role="dialog"` wrapper between the scrim and the panel.
 * The panel's `h-full` / `max-h-full` must resolve against the scrim, which the wrapper
 * used to be flattened out of (`display: contents`). But a `display: contents` wrapper
 * under the scrim kills native HTML5 drag for everything inside it (Chromium: no
 * `dragstart` for any descendant — the column reorder in every settings panel,
 * 2026-10-12), so the wrapper is a real box: a row flex box, stretched on the scrim's
 * cross axis and capped at the scrim, whose one child is stretched to its height, so the
 * panel's percentages resolve against the wrapper and the wrapper's against the scrim.
 * The bottom cap lives here, not on the panel: a percentage cap on the panel would be a
 * share of the wrapper's own content height and cut a short sheet.
 * A panel that asks for the whole scrim (`h-full` at the centre, `w-full` on a side — the
 * legacy checkout modal, a `size="full"` dialog) gets a wrapper that fills it too (`:has`),
 * which is what the flattening used to give it; the wrapper still never exceeds the panel's
 * box, so the scrim outside the panel keeps taking the outside press.
 * The phone sheet mounts no wrapper (its own panel is the `role="dialog"`) and is marked out.
 * Full literals: the class scanner cannot see a composed string.
 */
const WRAPPER_FILLS_WITH_PANEL =
	'[&>[role=dialog]:not([data-sheet]):has(>.h-full)]:h-full [&>[role=dialog]:not([data-sheet]):has(>.w-full)]:w-full';
export const SCRIM_WRAPPER: Record<OverlayPresentation, string> = {
	anchored: '',
	center: `[&>[role=dialog]:not([data-sheet])]:flex [&>[role=dialog]:not([data-sheet])]:max-h-full [&>[role=dialog]:not([data-sheet])]:max-w-full ${WRAPPER_FILLS_WITH_PANEL}`,
	left: `[&>[role=dialog]:not([data-sheet])]:flex [&>[role=dialog]:not([data-sheet])]:max-h-full [&>[role=dialog]:not([data-sheet])]:max-w-full ${WRAPPER_FILLS_WITH_PANEL}`,
	right: `[&>[role=dialog]:not([data-sheet])]:flex [&>[role=dialog]:not([data-sheet])]:max-h-full [&>[role=dialog]:not([data-sheet])]:max-w-full ${WRAPPER_FILLS_WITH_PANEL}`,
	page: `[&>[role=dialog]:not([data-sheet])]:flex [&>[role=dialog]:not([data-sheet])]:max-h-full [&>[role=dialog]:not([data-sheet])]:max-w-full [&>[role=dialog]:not([data-sheet])]:w-full ${WRAPPER_FILLS_WITH_PANEL}`,
	bottom: `[&>[role=dialog]:not([data-sheet])]:flex [&>[role=dialog]:not([data-sheet])]:max-h-[92%] [&>[role=dialog]:not([data-sheet])]:max-w-full ${WRAPPER_FILLS_WITH_PANEL}`,
};
const SHEET_MARK = { dataSet: { sheet: '' } } as object;
/** Web: marks a scrim or panel whose Radix wrapper must wait for its exit (`overlay-hold` in global.css). */
export const EXIT_MARK = { dataSet: { exit: '' } } as object;
// `auto`: under a Radix modal dialog the body has `pointer-events: none`, which the layer would inherit.
const OUTSIDE_PRESS_LAYER: StyleProp<ViewStyle> = [
	StyleSheet.absoluteFill,
	{ pointerEvents: 'auto' },
];
export const OVERLAY_PANEL = {
	anchored: 'bg-card border-border rounded-lg border p-2 shadow-md',
	// `max-w-full`: the phone sheet is the phone's width, whatever cap an anchored caller set
	// (`max-w-80` on the variations popover left a 280 dp sheet, Pixel 2026-10-06).
	// Native caps the sheet on the shell's wrappers (a percentage on the panel resolved against
	// its own content); web has no such wrapper for a `[data-sheet]`, so the panel keeps the cap.
	bottom: `bg-card border-border w-full max-w-full ${isWeb ? 'max-h-[92%]' : 'max-h-full'} rounded-t-2xl border-t p-2`,
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
		exiting: SlideOutLeft.duration(PANEL_SLIDE_OUT).easing(EASE_EXIT),
	},
	right: {
		enter: 'web:animate-panel-in-right',
		exit: 'web:animate-panel-out-right',
		entering: SlideInRight.duration(PANEL_SLIDE).easing(EASE),
		exiting: SlideOutRight.duration(PANEL_SLIDE_OUT).easing(EASE_EXIT),
	},
	bottom: {
		enter: 'web:animate-sheet-in',
		exit: 'web:animate-sheet-out',
		entering: SlideInDown.duration(SHEET_RISE).easing(EASE),
		exiting: SlideOutDown.duration(PANEL_SLIDE_OUT).easing(EASE_EXIT),
	},
	page: {
		enter: 'web:animate-panel-in-right',
		exit: 'web:animate-panel-out-right',
		entering: SlideInRight.duration(PANEL_SLIDE).easing(EASE),
		exiting: SlideOutRight.duration(PANEL_SLIDE_OUT).easing(EASE_EXIT),
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
	const inset = useSheetInset(8);
	const setNode = React.useCallback(
		(panel: ViewInstance | null) => {
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
			// The shell's scrim sizes its Radix `role="dialog"` wrapper as the panel's box
			// (`SCRIM_WRAPPER`); this panel IS the box, so it marks itself out of that rule.
			{...SHEET_MARK}
			// Focusable itself, for a sheet with nothing tabbable inside (the settle fallback).
			tabIndex={-1}
			testID={testID}
			className={cn(
				className,
				OVERLAY_PANEL.bottom,
				open ? OVERLAY_MOTION.bottom.enter : OVERLAY_MOTION.bottom.exit,
				'z-50'
			)}
			style={[inset, style]}
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
/** The open sheets that own their dismiss, oldest first; the last one owns the keys. */
const keyOwners: object[] = [];
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
	const {
		ref,
		presentation,
		open,
		Scrim,
		onDismiss,
		onOutsidePress,
		blocking,
		pinned,
		fill = false,
		testID,
		children,
	} = props;
	const insets = useSafeAreaInsets();
	const keyboardVisible = useKeyboardVisible();
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
			(onDismiss ?? onOutsidePress)?.();
		},
		[onDismiss, onOutsidePress]
	);
	React.useEffect(() => {
		if (!open || !ownsDismiss) return;
		if (isWeb) {
			// A sheet without primitive Content has no Radix dismissable layer or focus scope:
			// Escape is ours, and Tab stays inside the modal sheet, wrapping at either end.
			// Every open sheet listens on the document, so only the newest one (a sheet opened
			// from a sheet sits above it) acts; native's BackHandler already serves its newest
			// subscriber first.
			const owner = {};
			keyOwners.push(owner);
			const onKey = (event: KeyboardEvent) => {
				if (keyOwners[keyOwners.length - 1] !== owner) return;
				if (event.key === 'Escape') {
					onDismissRef.current?.();
					return;
				}
				if (event.key !== 'Tab' || !node) return;
				const tabbables = Array.from(node.querySelectorAll<HTMLElement>(TABBABLE));
				const first = tabbables[0];
				const last = tabbables[tabbables.length - 1];
				const active = document.activeElement;
				const inside = active instanceof Node && node.contains(active);
				if (!first) {
					event.preventDefault();
					node.focus({ preventScroll: true });
				} else if (event.shiftKey && (active === first || !inside)) {
					event.preventDefault();
					last.focus();
				} else if (!event.shiftKey && (active === last || !inside)) {
					event.preventDefault();
					first.focus();
				}
			};
			document.addEventListener('keydown', onKey);
			return () => {
				keyOwners.splice(keyOwners.indexOf(owner), 1);
				document.removeEventListener('keydown', onKey);
			};
		}
		const back = BackHandler.addEventListener('hardwareBackPress', () => {
			onDismissRef.current?.();
			return true;
		});
		return () => back.remove();
	}, [open, ownsDismiss, node]);
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
	const context = { presentation, open, deferAutoFocus, onPanelNode, fill: !isWeb && fill };
	if (presentation === 'anchored') {
		/**
		 * The primitive positions the panel; the shell supplies only the plumbing the
		 * popover family used to carry each on its own. On web that is nothing: the
		 * primitive's `Overlay` is a passthrough and Radix Popper places the content,
		 * unless `onOutsidePress` makes it the full-screen layer that takes an outside press.
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
			<OverlayContext.Provider value={context}>
				{isWeb ? (
					<Scrim
						focusable={false}
						style={onOutsidePress ? OUTSIDE_PRESS_LAYER : undefined}
						onPress={onDismiss || onOutsidePress ? onScrimPress : undefined}
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
			ref={ref}
			{...EXIT_MARK}
			className={cn(
				'bg-scrim absolute top-0 right-0 bottom-0 left-0 flex',
				align[presentation],
				// A leaving overlay takes no presses: the next tap goes to what is under it.
				open ? 'web:animate-overlay-in' : 'web:animate-overlay-out pointer-events-none',
				// Radix inserts an auto-height [role=dialog] wrapper; give it the panel's box on every
				// presentation so h-full / max-h-full / max-w-full resolve (see SCRIM_WRAPPER — never
				// `display: contents`, which kills native drag inside the panel).
				SCRIM_WRAPPER[presentation]
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
					// A bottom sheet carries its own bottom inset (OverlaySheetPanel).
					paddingBottom: presentation === 'bottom' ? 0 : insets.bottom,
					paddingLeft: insets.left,
					paddingRight: insets.right,
				},
			]}
			className={cn(
				'flex bg-transparent',
				align[presentation],
				fill && 'items-stretch justify-start p-0'
			)}
		>
			<Scrim
				style={StyleSheet.absoluteFill}
				className={fill ? 'bg-card' : 'bg-scrim'}
				accessible={false}
				importantForAccessibility="no"
				accessibilityElementsHidden
				// A confirmation's scrim (`blocking`) must never take a touch: on Android a
				// scrim given its own z-index (the alert's `z-70`) ends up above the panel's
				// wrapper and swallows every tap. Measured on a Pixel 10, 2026-10-13 (Restore
				// server settings: Cancel and Confirm dead). Every other scrim dismisses on a
				// press (the primitives' Overlay), so it keeps its touches.
				pointerEvents={blocking && !isWeb ? 'none' : undefined}
				testID={testID ? `${testID}-scrim` : 'overlay-scrim'}
			/>
			<KeyboardAvoidingView
				pointerEvents="box-none"
				behavior="padding"
				// Measured on a Pixel 10 (2026-10-13): with the keyboard hidden the padding
				// behaviour still pads a bottom sheet ~9 dp off the screen edge. A sheet sits on
				// the edge, so its wrapper is on only while the keyboard is up, and pushes the
				// sheet (a searchable picker opens the keyboard on mount) from the edge.
				keyboardVerticalOffset={presentation === 'bottom' ? 0 : insets.bottom}
				enabled={presentation !== 'bottom' || keyboardVisible}
				// The sheet's height cap lives on the wrappers, not the panel: a percentage cap on
				// the panel resolves against a wrapper that is itself sized by the panel, and the
				// panel ends up clipped to 92% of its own content (same measurement).
				className={cn(
					'max-w-full',
					fullHeight && 'h-full',
					fill && 'h-full w-full',
					presentation === 'bottom' ? 'max-h-[92%] w-full' : 'max-h-full'
				)}
			>
				<Animated.View
					pointerEvents="box-none"
					onAccessibilityEscape={onDismiss}
					entering={OVERLAY_MOTION[presentation].entering}
					exiting={OVERLAY_MOTION[presentation].exiting}
					className={cn(
						'max-h-full max-w-full',
						fullHeight && 'h-full',
						fill && 'h-full w-full',
						presentation === 'bottom' && 'w-full'
					)}
				>
					{children}
				</Animated.View>
			</KeyboardAvoidingView>
		</View>
	);
	return (
		<OverlayContext.Provider value={context}>
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
