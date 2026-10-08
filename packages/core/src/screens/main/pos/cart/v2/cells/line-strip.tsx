import * as React from 'react';
import { Pressable, View } from 'react-native';

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

import { Button } from '@wcpos/components/button';
import { usePointer } from '@wcpos/components/lib/device';
import { hapticTick } from '@wcpos/components/lib/haptics';
import { EASE, EASE_EXIT, OVERLAY_FADE, PANEL_SLIDE_OUT } from '@wcpos/components/lib/motion';
import type { PulseTableRowRef } from '@wcpos/components/table';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { editOffset, releaseOutcome, removeOffset, removePoint } from './line-strip.geometry';
import { useT } from '../../../../../../contexts/translations';
import { useRemoveLineItem } from '../../../hooks/use-remove-line-item';
import { EditCartItemButton } from '../../cells/edit-cart-item-button';
import { EditLineItem } from '../../cells/edit-line-item';
import { EditFeeLine } from '../../cells/edit-fee-line';
import { EditShippingLine } from '../../cells/edit-shipping-line';

import type { CartLine } from '../../../hooks/utils';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'remove']);
/** How far a hovered row rests to the left: enough of the strip's red edge to read as "there is something under here". */
const PEEK = 16;
/**
 * The hover bounce. Underdamped on purpose (ratio ≈ 0.3): the row overshoots the peek by about
 * a third, to roughly 22 px, and settles in two visible swings.
 */
const PEEK_SPRING = { mass: 1, stiffness: 380, damping: 12 };
/**
 * How far the total's hover area reaches to the RIGHT of the total itself. The total rides on
 * the row it moves, so without this the bounce carries it out from under a pointer resting on
 * its right-hand side, hover ends, the row springs back under the pointer, hover starts again,
 * and the row flickers for as long as the pointer stays put. The reach must exceed the furthest
 * the bounce travels (see PEEK_SPRING), so the area under the pointer never changes while the
 * row moves; leaving is then always the cashier's move, never the animation's.
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
type Props = {
	line: { uuid: string; type: 'line_items' | 'fee_lines' | 'shipping_lines'; item: CartLine };
	rowRefs: React.RefObject<Map<string, PulseTableRowRef | null>>;
	children: (wrapTotal: (content: React.ReactNode) => React.ReactNode) => React.ReactNode;
};
export function LineStrip({ line: { uuid, type, item }, rowRefs, children }: Props) {
	const pointer = usePointer();
	const t = useT();
	const { removeLineItem } = useRemoveLineItem();
	const [rowWidth, setRowWidth] = React.useState(0);
	const [editWidth, setEditWidth] = React.useState(0);
	const [removeWidth, setRemoveWidth] = React.useState(0);
	const stripWidth = editWidth + removeWidth;
	const [open, setOpenState] = React.useState(false);
	const [dragging, setDragging] = React.useState(false);
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
	};
	const swiped = useSharedValue(false);
	const offset = useSharedValue(0);
	/** 0 with Edit in its place, 1 with Remove over it. */
	const swallow = useSharedValue(0);
	const reduced = useReducedMotion();
	const style = useAnimatedStyle(() => ({ transform: [{ translateX: onStage(offset.value) }] }));
	const editStyle = useAnimatedStyle(() => ({
		opacity: 1 - swallow.value,
		transform: [
			{ translateX: editOffset(-onStage(offset.value), stripWidth, editWidth, swallow.value) },
		],
	}));
	const removeStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: removeOffset(-onStage(offset.value), removeWidth, swallow.value) }],
	}));
	const settle = (x: number) => {
		offset.set(reduced ? x : withSpring(x, { overshootClamping: true }));
	};
	const peek = () => {
		offset.set(reduced ? -PEEK : withSpring(-PEEK, PEEK_SPRING));
	};
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
						// only ActiveScopeChangedTwiceError, so a rejection getting this far
						// is unexpected. Log it — without a second toast, which would double
						// up on the cashier.
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
				settle(open ? -stripWidth : 0);
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
				testID="cart-line-total"
				accessibilityRole="button"
				accessibilityLabel={t('pos_cart.edit_line')}
				className={
					pointer === 'fine'
						? 'min-h-row web:cursor-pointer justify-center'
						: 'min-h-row justify-center'
				}
				onHoverIn={
					pointer === 'fine'
						? () => {
								if (!opened.get() && !leaving.get()) peek();
							}
						: undefined
				}
				onHoverOut={
					pointer === 'fine'
						? () => {
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
		<View
			testID="cart-line-row"
			className="relative flex-1 overflow-hidden"
			onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
		>
			{/* The strip is the whole row wide and red: whatever the body uncovers past the buttons is
			    Remove's colour, and Edit rides with the body's edge until Remove swallows it. */}
			<View
				testID="cart-line-strip"
				className="bg-destructive absolute inset-y-0 right-0 flex-row items-stretch justify-end"
				style={rowWidth ? { width: rowWidth } : undefined}
				pointerEvents={open ? 'auto' : 'none'}
				accessibilityElementsHidden={!open}
				importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
			>
				<Animated.View
					testID="cart-line-edit-slot"
					className="flex-row items-stretch"
					style={editStyle}
					onLayout={(e) => setEditWidth(e.nativeEvent.layout.width)}
					pointerEvents={armed ? 'none' : 'auto'}
					aria-hidden={armed}
				>
					<EditCartItemButton title={title} trigger="label">
						{type === 'line_items' ? (
							<EditLineItem
								uuid={uuid}
								item={item as React.ComponentProps<typeof EditLineItem>['item']}
							/>
						) : type === 'fee_lines' ? (
							<EditFeeLine
								uuid={uuid}
								item={item as React.ComponentProps<typeof EditFeeLine>['item']}
							/>
						) : (
							<EditShippingLine
								uuid={uuid}
								item={item as React.ComponentProps<typeof EditShippingLine>['item']}
							/>
						)}
					</EditCartItemButton>
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
						className="min-w-tile h-auto rounded-none px-5"
						onPress={() => leave(true)}
					>
						{t('pos_cart.remove_line')}
					</Button>
				</Animated.View>
			</View>
			{/* The body carries the row surface: the strip sits under it and shows only where the body has slid away. */}
			<GestureDetector gesture={pan}>
				<Animated.View
					className={
						dragging ? 'web:select-none bg-card min-h-row flex-row' : 'bg-card min-h-row flex-row'
					}
					style={style}
				>
					{children(wrapTotal)}
				</Animated.View>
			</GestureDetector>
		</View>
	);
}
