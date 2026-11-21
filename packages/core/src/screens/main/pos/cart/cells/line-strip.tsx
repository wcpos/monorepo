import * as React from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withDelay,
	withSpring,
	withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Button, ButtonText } from '@wcpos/components/button';
import { usePointer } from '@wcpos/components/lib/device';
import { hapticTick } from '@wcpos/components/lib/haptics';
import { EASE, EASE_EXIT, OVERLAY_FADE, PANEL_SLIDE_OUT } from '@wcpos/components/lib/motion';
import type { PulseTableRowRef } from '@wcpos/components/table';
import { getErrorMessage, getLogger, isErrorReported } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import {
	bodyOffset,
	closeMinWidth,
	editOffset,
	releaseOutcome,
	removeOffset,
	removePoint,
	stripInWindow,
	windowOffset,
	windowOpacity,
} from './line-strip.geometry';
import { useT } from '../../../../../contexts/translations';
import { useRemoveLineItem } from '../../hooks/use-remove-line-item';
import { EditCartItemButton } from './edit-cart-item-button';
import { EditFeeLineForm } from './edit-fee-line/form';
import { EditLineItemForm } from './edit-line-item/form';
import { EditShippingLineForm } from './edit-shipping-line/form';
import { StripEdgeContext } from './strip-clear';

import type { CartLine } from '../../hooks/utils';
import type { OpenLine } from '../open-line';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'remove']);
/** How far the strip slides in over a hovered row: enough of its edge to read as "there is something here". */
const PEEK = 16;
/**
 * The hover bounce. Underdamped on purpose (ratio ≈ 0.3): the strip's window overshoots the peek
 * by about a third, to roughly 22 px, and settles in two visible swings; the body holds still.
 */
const PEEK_SPRING = { mass: 1, stiffness: 380, damping: 12 };
/**
 * How far the total's hover area reaches to the RIGHT of the total itself. On hover the total
 * stays put and the strip's window slides in over the row's trailing edge; while the row is
 * closed the window and the strip take no pointer events, so the pointer stays on the total
 * underneath. The reach must exceed the furthest the bounce travels (see PEEK_SPRING), so a
 * pointer resting on the total's right-hand side stays inside its hover area through the bounce;
 * leaving is then always the cashier's move, never the animation's.
 */
const HOVER_REACH = PEEK * 2;
/**
 * Remove swallowing Edit when the pull crosses the line, and Edit returning when it comes back:
 * a cover arriving over a control, on the overlay's own duration.
 */
const SWALLOW = { duration: OVERLAY_FADE, easing: EASE };
/**
 * A press of Remove waits this long before the row flies: the swallow and the row's red land
 * first, so the button plays the same picture as a swipe past the line. It is the row's own
 * "lit" duration (`table/pulse-row.tsx`).
 */
const ARM = 120;
/** The abutting tiles draw the Button's focus ring and gap inside them (`global.css`, Controls tier). */
const INSET_RING = 'inset';
/** An open line's name ends this far before the strip's leading edge (the board's 12 px). */
const NAME_CLEAR = 12;
/** The row leaving: accelerate into the edge, the shared exit. */
const FLY = { duration: PANEL_SLIDE_OUT, easing: EASE_EXIT };
/**
 * The row never moves right of its rest. A spring retargeted mid-flight keeps the velocity it
 * already has when that velocity points at the new target (Reanimated's `withSpring`), so a
 * hover that lands while the strip is still sliding shut arrives at the peek fast and the
 * underdamped bounce can swing past 0, opening a gap on the row's left. Clamped at the style,
 * so no sequence of hover, press and swipe can show that gap.
 */
export function onStage(x: number): number {
	'worklet';
	return Math.min(0, x);
}
/** A view's web DOM node: a fine pointer and its keyboard exist only there. */
function dom(ref: React.RefObject<unknown>) {
	return ref.current as unknown as HTMLElement | null;
}
/** Enter or Space: react-native-web presses with a click no pointer made (`detail` 0, Chromium). */
function byKey(event: unknown) {
	const press = event as { detail?: number; nativeEvent?: { detail?: number } } | undefined;
	return (press?.nativeEvent ?? press)?.detail === 0;
}
type Props = {
	line: { uuid: string; type: 'line_items' | 'fee_lines' | 'shipping_lines'; item: CartLine };
	rowRefs: React.RefObject<Map<string, PulseTableRowRef | null>>;
	/** The cart's one open line: this row reports to it, and it closes this row for another. */
	openLine: OpenLine;
	children: (wrapTotal: (content: React.ReactNode) => React.ReactNode) => React.ReactNode;
};
export function LineStrip({ line: { uuid, type, item }, rowRefs, openLine, children }: Props) {
	const pointer = usePointer();
	const fine = pointer === 'fine';
	const t = useT();
	const { removeLineItem } = useRemoveLineItem();
	const [rowWidth, setRowWidth] = React.useState(0);
	const [editWidth, setEditWidth] = React.useState(0);
	const [removeWidth, setRemoveWidth] = React.useState(0);
	const [closeWidth, setCloseWidth] = React.useState(0);
	/** Fine pointer: the total's leading edge to the row's trailing edge, the footprint Close covers. */
	const [totalReach, setTotalReach] = React.useState(0);
	const [rowRight, setRowRight] = React.useState(0);
	// Touch has no Close tile: the strip is pulled open and pushed back by the finger.
	const trailing = removeWidth + (fine ? closeWidth : 0);
	const stripWidth = editWidth + trailing;
	const rowView = React.useRef<React.ComponentRef<typeof View>>(null);
	const totalView = React.useRef<React.ComponentRef<typeof View>>(null);
	const measureReach = () => {
		const row = dom(rowView)?.getBoundingClientRect?.();
		const total = dom(totalView)?.getBoundingClientRect?.();
		if (!fine || !row || !total) return;
		setTotalReach(Math.round(row.right - total.left));
		setRowRight(row.right);
	};
	const focusTotal = () => dom(totalView)?.focus?.({ preventScroll: true });
	/** Close was pressed with the pointer over the total: no peek until the pointer has left it. */
	const hushed = React.useRef(false);
	const [open, setOpenState] = React.useState(false);
	const edge = fine && open ? rowRight - stripWidth - NAME_CLEAR : null;
	const tile = open ? 0 : -1; // Closed, no tab stops: Tab never walks into a hidden Remove.
	const [dragging, setDragging] = React.useState(false);
	/**
	 * Web: the body's DOM node, and the pointer that is down on it. Gesture Handler captures
	 * the pointer on whatever cell the pull STARTED on, so the release — `pointerup`, `mouseup`
	 * and the `click` the browser synthesises — is retargeted to that cell however far the
	 * mouse has travelled: a pull that began on the name opened the name editor, one that began
	 * on the price opened the numpad, and the cell wore its hover state for the whole pull
	 * (traced on the web build, 2026-10-08). When the pan activates the body takes the capture
	 * instead: the release lands on the body, no cell is clicked, hover follows the pointer.
	 * Gesture Handler reads the cell's `lostpointercapture` as a cancel, so that one event is
	 * stopped before it reaches the body's listeners; the body's own loss at release still does.
	 */
	const [bodyEl, setBodyEl] = React.useState<HTMLElement | null>(null);
	// A stable callback ref: an inline one changes identity every render, and React then detaches
	// (null) and re-attaches (node) it on each commit (Codex review, #2450).
	const bodyRef = React.useCallback((node: unknown) => setBodyEl(node as HTMLElement | null), []);
	const pointerId = useSharedValue(-1);
	/** The body holds the capture of `pointerId` right now: only that loss is ours to hide. */
	const holding = useSharedValue(false);
	React.useEffect(() => {
		if (Platform.OS !== 'web' || !bodyEl?.addEventListener) return;
		const down = (event: PointerEvent) => pointerId.set(event.pointerId);
		const lost = (event: Event) => {
			const { target, pointerId: id } = event as PointerEvent;
			if (target === bodyEl) {
				// The release: the body's own loss, which Gesture Handler must see.
				holding.set(false);
				return;
			}
			// The cell's loss as the body takes over. Any other loss (the browser or the OS
			// taking a pointer mid-press) is still the library's cancellation signal.
			if (holding.get() && id === pointerId.get()) event.stopPropagation();
		};
		bodyEl.addEventListener('pointerdown', down, true);
		bodyEl.addEventListener('lostpointercapture', lost, true);
		return () => {
			bodyEl.removeEventListener('pointerdown', down, true);
			bodyEl.removeEventListener('lostpointercapture', lost, true);
		};
	}, [bodyEl, pointerId, holding]);
	const takePointer = () => {
		if (Platform.OS !== 'web' || !bodyEl || pointerId.get() < 0) return;
		try {
			// Set before the call: the cell loses the capture synchronously inside it.
			holding.set(true);
			bodyEl.setPointerCapture(pointerId.get());
		} catch {
			// The pointer is no longer down: nothing to take.
			holding.set(false);
		}
		// The mouse-down focused the cell the pull began on, and a focused cell keeps its focus
		// background after the release, with the pointer long gone (filmed 2026-10-08). Native
		// cancels the touchable when the pan activates; this is the web's equivalent.
		const focused = document.activeElement as HTMLElement | null;
		if (focused && focused !== bodyEl && bodyEl.contains(focused)) focused.blur?.();
	};
	/** Past the line: Remove has swallowed Edit and the row is red. */
	const [armed, setArmedState] = React.useState(false);
	const armedNow = useSharedValue(false);
	/** The row is flying off or its removal is committing: nothing else may move it. */
	const leaving = useSharedValue(false);
	/**
	 * `open` again, readable at event time. react-native-web binds a Pressable's hover-out
	 * listener when the pointer ENTERS and keeps that closure until it leaves, so a hover
	 * handler that closes over `open` still sees `false` after the press that opened the strip:
	 * the pointer's next move off the (now slid-away) total sent the row home over Edit and
	 * Remove. The hover handlers read this instead.
	 */
	const opened = useSharedValue(false);
	const setOpen = (next: boolean) => {
		opened.set(next);
		setOpenState(next);
		if (next) openLine.opened(uuid, close);
		else openLine.closed(uuid);
	};
	/** Back to rest from open: Close, Escape, a press elsewhere, another line opening, a scroll. */
	const close = () => {
		if (!opened.get() || leaving.get()) return;
		setOpen(false);
		settle(0);
	};
	React.useEffect(() => () => openLine.closed(uuid), [openLine, uuid]);
	const swiped = useSharedValue(false);
	const offset = useSharedValue(0);
	/** 0 with Edit in its place, 1 with Remove over it. */
	const swallow = useSharedValue(0);
	const reduced = useReducedMotion();
	const style = useAnimatedStyle(() => ({
		transform: [{ translateX: bodyOffset(-onStage(offset.value), stripWidth) }],
	}));
	const windowStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: windowOffset(-onStage(offset.value), rowWidth) }],
		// Unmeasured, the window would sit over the whole row: an unmeasured row never shows the strip.
		opacity: windowOpacity(rowWidth),
	}));
	const stripStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: stripInWindow(-onStage(offset.value), stripWidth, rowWidth) }],
	}));
	const editStyle = useAnimatedStyle(() => ({
		opacity: 1 - swallow.value,
		transform: [
			{ translateX: editOffset(-onStage(offset.value), stripWidth, editWidth, swallow.value) },
		],
	}));
	const removeStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: removeOffset(-onStage(offset.value), trailing, swallow.value) }],
	}));
	// Past the line the whole strip is Remove's: Close gives way with Edit.
	const closeStyle = useAnimatedStyle(() => ({ opacity: 1 - swallow.value }));
	const settle = (x: number) => {
		offset.set(reduced ? x : withSpring(x, { overshootClamping: true }));
	};
	const peek = () => {
		offset.set(reduced ? -PEEK : withSpring(-PEEK, PEEK_SPRING));
	};
	// Web, while open: a press outside closes it and still lands (heard on the way down, never
	// stopped). Escape closes it too, unless the focus is elsewhere (an Edit sheet's Escape is its own).
	const onOutsidePress = React.useEffectEvent((event: PointerEvent) => {
		if (!dom(rowView)?.contains(event.target as Node)) close();
	});
	const onEscape = React.useEffectEvent((event: KeyboardEvent) => {
		const focused = document.activeElement;
		if (event.key !== 'Escape') return;
		if (focused && focused !== document.body && !dom(rowView)?.contains(focused)) return;
		close();
		focusTotal();
	});
	React.useEffect(() => {
		if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return;
		const down = (event: PointerEvent) => onOutsidePress(event);
		const key = (event: KeyboardEvent) => onEscape(event);
		document.addEventListener('pointerdown', down, true);
		document.addEventListener('keydown', key);
		return () => {
			document.removeEventListener('pointerdown', down, true);
			document.removeEventListener('keydown', key);
		};
	}, [open]);
	/**
	 * Crossing the line, either way: Remove swallows Edit (or gives it back), the row takes its
	 * red (or drops it), one tick. Idempotent, so a pull can hover around the line.
	 */
	const arm = (next: boolean) => {
		if (armedNow.get() === next) return;
		armedNow.set(next);
		setArmedState(next);
		swallow.set(reduced ? (next ? 1 : 0) : withTiming(next ? 1 : 0, SWALLOW));
		rowRefs.current?.get(uuid)?.armRemove(next);
		hapticTick();
	};
	/**
	 * Every removal goes through `pulseRemove`, which owns the re-entrancy guard
	 * (wcpos/monorepo#1693). Repeat calls are no-ops there while a pulse is in
	 * flight, and its latch is held until the committed removal settles. The latch
	 * here guards only the flight: once the row is on its way out, a second press or
	 * a hover must not retarget it, and it is released the moment the row is shown
	 * to still be here (a cancelled flight, a failed write), so the line is never
	 * left unremovable or off stage.
	 */
	const commitRemoval = () => {
		const rowRef = rowRefs.current?.get(uuid);
		const back = () => {
			leaving.set(false);
			arm(false);
			setOpen(false);
			settle(0);
		};
		if (!rowRef) {
			back();
			return;
		}
		rowRef.pulseRemove(
			() =>
				removeLineItem(uuid, type)
					.catch((error: unknown) => {
						// `localPatch` logs and toasts every failure it handles, and re-raises
						// only ActiveScopeChangedTwiceError — already reported, so skipped. Any
						// other rejection getting this far is unexpected. Log it — without a
						// second toast, which would double up on the cashier.
						// An order queued for deletion now comes back as a refusal (toasted, `false`).
						if (isErrorReported(error)) return;
						cartLogger.error('Cart line removal failed', {
							code: ERROR_CODES.CART_UPDATE_FAILED,
							context: { uuid, itemType: type, error: getErrorMessage(error) },
						});
					})
					// On success the row unmounts and none of this lands; on failure the line is
					// still in the cart and comes back on stage.
					.finally(back),
			// An add pulse (a quantity change landing mid-removal) cancels the removal before it
			// commits; the row is still here and must come back on stage (Codex, #2447).
			{ onCancel: back }
		);
	};
	const flown = (finished: boolean) => {
		if (!finished) {
			// Retargeted mid-flight: the row is still here, somewhere; bring it home.
			leaving.set(false);
			arm(false);
			setOpen(false);
			settle(0);
			return;
		}
		commitRemoval();
	};
	/**
	 * The line leaves: past the line already (a swipe) or armed now (a press), it flies off the
	 * left edge, then the row closes the gap and the removal commits. Reduced motion skips the
	 * flight: the red lands and the row goes.
	 */
	const leave = (fromPress: boolean) => {
		if (leaving.get()) return;
		leaving.set(true);
		arm(true);
		if (reduced) {
			commitRemoval();
			return;
		}
		const fly = withTiming(-rowWidth, FLY, (finished) => {
			'worklet';
			scheduleOnRN(flown, !!finished);
		});
		// A press lets the swallow and the red land before the row moves; a swipe is already
		// past the line with both in place.
		offset.set(fromPress ? withDelay(ARM, fly) : fly);
	};
	// The pan covers the whole row (a pull on the name or the quantity reveals the strip too);
	// with `activeOffsetX` it never steals a tap from a cell's control, and on a fine pointer it
	// is the held mouse: 8 px of travel before the row takes the drag, so a click is a click.
	const pan = Gesture.Pan()
		.runOnJS(true)
		.activeOffsetX([-8, 8])
		.failOffsetY([-8, 8])
		.onStart(() => {
			if (leaving.get()) return;
			setDragging(true);
			takePointer();
		})
		.onUpdate((event) => {
			if (leaving.get()) return;
			swiped.set(true);
			const x = Math.max(-rowWidth, Math.min(0, (open ? -stripWidth : 0) + event.translationX));
			offset.set(x);
			arm(-x >= removePoint(rowWidth, stripWidth));
		})
		.onFinalize((event, success) => {
			setDragging(false);
			// The latch suppresses the press that ends THIS gesture; a pan that began on the
			// name or the quantity never presses the total, so clear it once that press has had
			// its turn, or the next deliberate tap on the total is swallowed.
			setTimeout(() => swiped.set(false), 0);
			if (leaving.get()) return;
			if (!success) {
				// Interrupted (another gesture took it, the touch was cancelled): not a release,
				// never a removal. Back to the rest it started from (Codex, #2447).
				arm(false);
				settle(opened.get() ? -stripWidth : 0);
				return;
			}
			const revealed = -Math.max(
				-rowWidth,
				Math.min(0, (open ? -stripWidth : 0) + event.translationX)
			);
			const outcome = releaseOutcome({
				revealed,
				velocityX: event.velocityX,
				rowWidth,
				stripWidth,
			});
			if (outcome === 'remove') {
				leave(false);
				return;
			}
			arm(false);
			const next = outcome === 'open';
			setOpen(next);
			settle(next ? -stripWidth : 0);
		});
	const wrapTotal = (content: React.ReactNode) => {
		const target = (
			<Pressable
				ref={totalView}
				testID="cart-line-total"
				accessibilityRole="button"
				accessibilityLabel={t('pos_cart.edit_line')}
				className={
					pointer === 'fine'
						? 'min-h-row web:cursor-pointer justify-center'
						: 'min-h-row justify-center'
				}
				onLayout={measureReach}
				onHoverIn={
					pointer === 'fine'
						? () => {
								if (!opened.get() && !leaving.get() && !hushed.current) peek();
							}
						: undefined
				}
				onHoverOut={
					pointer === 'fine'
						? () => {
								hushed.current = false;
								if (!opened.get() && !leaving.get()) settle(0);
							}
						: undefined
				}
				onPress={(event) => {
					event.stopPropagation();
					if (swiped.get()) {
						swiped.set(false);
						return;
					}
					if (leaving.get()) return;
					setOpen(!open);
					settle(open ? 0 : -stripWidth);
					// Enter or Space: the strip opens onto Edit, its first button in reading order.
					if (!open && byKey(event)) {
						dom(rowView)
							?.querySelector<HTMLElement>(`[data-ring="${INSET_RING}"] [role="button"]`)
							?.focus({ preventScroll: true });
					}
				}}
			>
				{content}
				{/* Closed only: on an opened row the reach would overhang Edit's left edge and take its presses. */}
				{pointer === 'fine' && !open ? (
					<View
						testID="cart-line-total-hover-reach"
						className="absolute inset-y-0 left-0"
						style={{ right: -HOVER_REACH }}
					/>
				) : null}
			</Pressable>
		);
		return target;
	};
	const title = t('common.edit_2', {
		name: 'name' in item ? item.name : 'method_title' in item ? item.method_title : '',
	});
	/**
	 * Add-pulses are triggered by the cart table's detection effect (which owns
	 * rowRefs); this cell only handles the remove flow.
	 */
	return (
		// Clipped, not hidden, on web: focus scrolls an `overflow: hidden` box, and slid the row sideways.
		<View
			ref={rowView}
			testID="cart-line-row"
			className="web:overflow-clip relative flex-1 overflow-hidden"
			onLayout={(e) => {
				setRowWidth(e.nativeEvent.layout.width);
				measureReach();
			}}
		>
			{/* The body carries the row surface; the strip's window paints over its trailing cells. */}
			{/* On web, the detector defaults to touch-action: none and blocks vertical drags on rows from scrolling the cart; pan-y gives vertical pans to the browser and keeps horizontal swipes (ignored on native). */}
			<GestureDetector gesture={pan} touchAction="pan-y">
				<Animated.View
					ref={bodyRef}
					testID="cart-line-body"
					className={
						dragging ? 'web:select-none bg-card min-h-row flex-row' : 'bg-card min-h-row flex-row'
					}
					style={style}
				>
					<StripEdgeContext.Provider value={edge}>{children(wrapTotal)}</StripEdgeContext.Provider>
					{open ? (
						// A press on the open line's own name or quantity closes the strip and does nothing else.
						<Pressable
							testID="cart-line-close-catch"
							className="absolute inset-0"
							tabIndex={-1}
							aria-hidden
							onPress={() => {
								if (swiped.get()) swiped.set(false);
								else close();
							}}
						/>
					) : null}
				</Animated.View>
			</GestureDetector>
			<Animated.View
				testID="cart-line-strip-window"
				className="web:overflow-clip absolute inset-0 overflow-hidden"
				style={windowStyle}
				pointerEvents="box-none"
			>
				{/* The window is the row wide and slides in from the trailing edge, and the strip counter-slides inside it, so the strip slides in over the row's figures and the quantity and the name stay put at the open rest; the red fills what the window shows past the buttons, and Edit rides at its leading edge until Remove swallows it. */}
				<Animated.View
					testID="cart-line-strip"
					className="bg-destructive absolute inset-y-0 right-0 flex-row items-stretch justify-end"
					style={[rowWidth ? { width: rowWidth } : undefined, stripStyle]}
					pointerEvents={open ? 'auto' : 'none'}
					accessibilityElementsHidden={!open}
					importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
					{...{ dataSet: { ring: INSET_RING } }}
				>
					<Animated.View
						testID="cart-line-edit-slot"
						// The slot paints the Edit block's primary, the swipe grammar's normal action beside the
						// destructive one (Paul, 2026-10-30, strip board B): both blocks solid, both white words, both
						// dim on hover. The muted grey it wore was a surface colour and no Button's, and the ghost on
						// it changed word and surface on hover while Remove only dimmed.
						className="bg-primary flex-row items-stretch"
						style={editStyle}
						onLayout={(e) => setEditWidth(e.nativeEvent.layout.width)}
						pointerEvents={armed || !open ? 'none' : 'auto'}
						aria-hidden={armed}
					>
						{/* The grey reaches a little under the body: react-native-web reports layout widths
					    rounded to whole pixels, so the open row can stop a fraction past Edit's edge and
					    would show a hairline of the strip's red there. */}
						<View className="bg-primary absolute inset-y-0 right-full w-1" />
						<EditCartItemButton
							tabIndex={tile}
							title={title}
							item={item}
							form={
								type === 'line_items' ? (
									<EditLineItemForm
										uuid={uuid}
										item={item as React.ComponentProps<typeof EditLineItemForm>['item']}
									/>
								) : type === 'fee_lines' ? (
									<EditFeeLineForm
										uuid={uuid}
										item={item as React.ComponentProps<typeof EditFeeLineForm>['item']}
									/>
								) : (
									<EditShippingLineForm
										uuid={uuid}
										item={item as React.ComponentProps<typeof EditShippingLineForm>['item']}
									/>
								)
							}
						/>
					</Animated.View>
					<Animated.View
						testID="cart-line-remove-slot"
						className="flex-row items-stretch"
						style={removeStyle}
						onLayout={(e) => setRemoveWidth(e.nativeEvent.layout.width)}
					>
						<Button
							variant="destructive"
							testID="cart-line-remove"
							tabIndex={tile}
							// The swipe block fills the row it sits under, square (the 2026-10-08 swipe ruling).
							// eslint-disable-next-line no-restricted-syntax
							className="min-w-tile h-auto rounded-none px-5"
							onPress={() => leave(true)}
						>
							{/* The strip's words read alike: Remove's label takes Edit's weight. */}
							<ButtonText className="font-strong">{t('pos_cart.remove_line')}</ButtonText>
						</Button>
					</Animated.View>
					{fine ? (
						<Animated.View
							testID="cart-line-close-slot"
							// The row's own surface under a quiet Button: the row's end, not a third coloured action.
							className="bg-card flex-row items-stretch"
							style={[
								{ minWidth: closeMinWidth(totalReach, rowWidth, editWidth + removeWidth) },
								closeStyle,
							]}
							onLayout={(e) => setCloseWidth(e.nativeEvent.layout.width)}
						>
							<Button
								variant="ghost"
								testID="cart-line-close"
								tabIndex={tile}
								// eslint-disable-next-line no-restricted-syntax
								className="h-auto flex-1 rounded-none"
								onPress={(event) => {
									// The pointer that pressed Close is over the total again once the strip leaves.
									hushed.current = !byKey(event);
									close();
									focusTotal();
								}}
							>
								{t('common.close')}
							</Button>
						</Animated.View>
					) : null}
				</Animated.View>
			</Animated.View>
		</View>
	);
}
