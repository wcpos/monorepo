import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withSpring,
} from 'react-native-reanimated';

import { Button } from '@wcpos/components/button';
import { usePointer } from '@wcpos/components/lib/device';
import type { PulseTableRowRef } from '@wcpos/components/table';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

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
type Props = {
	line: { uuid: string; type: 'line_items' | 'fee_lines' | 'shipping_lines'; item: CartLine };
	rowRefs: React.RefObject<Map<string, PulseTableRowRef | null>>;
	children: (wrapTotal: (content: React.ReactNode) => React.ReactNode) => React.ReactNode;
};
export function LineStrip({ line: { uuid, type, item }, rowRefs, children }: Props) {
	const pointer = usePointer();
	const t = useT();
	const { removeLineItem } = useRemoveLineItem();
	const [width, setWidth] = React.useState(0);
	const [open, setOpenState] = React.useState(false);
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
	const reduced = useReducedMotion();
	const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
	const settle = (x: number) => {
		offset.set(reduced ? x : withSpring(x, { overshootClamping: true }));
	};
	const peek = () => {
		offset.set(reduced ? -PEEK : withSpring(-PEEK, PEEK_SPRING));
	};
	const pan = Gesture.Pan()
		.runOnJS(true)
		.activeOffsetX([-8, 8])
		.failOffsetY([-8, 8])
		.onUpdate((event) => {
			swiped.set(true);
			offset.set(Math.max(-width, Math.min(0, (open ? -width : 0) + event.translationX)));
		})
		.onFinalize((event) => {
			const next = (open ? -width : 0) + event.translationX < -width / 2;
			setOpen(next);
			settle(next ? -width : 0);
			// The latch suppresses the press that ends THIS gesture; a pan that began on the
			// name or the quantity never presses the total, so clear it once that press has had
			// its turn, or the next deliberate tap on the total is swallowed.
			setTimeout(() => swiped.set(false), 0);
		});
	/**
	 * Every press is forwarded; `pulseRemove` owns the re-entrancy guard
	 * (wcpos/monorepo#1693). Repeat presses are no-ops there while a pulse is in
	 * flight, and its latch is held until the committed removal settles, so a
	 * second latch here would guard nothing — and it could not be released
	 * correctly: a quantity change on this line makes the cart table fire
	 * `pulseAdd()` for the same uuid, cancelling the remove pulse so the callback
	 * below never runs. A cell-level latch would then stay set forever and the
	 * line would be unremovable. One owner for the guard, and it is the one that
	 * can see the cancellation.
	 */
	const handleRemoveLineItem = () => {
		const rowRef = rowRefs.current?.get(uuid);
		if (rowRef) {
			rowRef.pulseRemove(() =>
				removeLineItem(uuid, type).catch((error: unknown) => {
					// `localPatch` logs and toasts every failure it handles, and re-raises
					// only ActiveScopeChangedTwiceError, so a rejection getting this far
					// is unexpected. Log it — without a second toast, which would double
					// up on the cashier.
					cartLogger.error('Cart line removal failed', {
						code: ERROR_CODES.CART_UPDATE_FAILED,
						context: { uuid, itemType: type, error: getErrorMessage(error) },
					});
				})
			);
		}
	};
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
								if (!opened.get()) peek();
							}
						: undefined
				}
				onHoverOut={
					pointer === 'fine'
						? () => {
								if (!opened.get()) settle(0);
							}
						: undefined
				}
				onPress={(event) => {
					event.stopPropagation();
					if (swiped.get()) {
						swiped.set(false);
						return;
					}
					setOpen(!open);
					settle(open ? 0 : -width);
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
		<View className="relative flex-1 overflow-hidden">
			<View
				className="absolute inset-y-0 right-0 flex-row items-stretch"
				onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
				pointerEvents={open ? 'auto' : 'none'}
				accessibilityElementsHidden={!open}
				importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
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
				<Button
					variant="destructive"
					testID="cart-line-remove"
					className="min-w-tile h-auto rounded-none px-5"
					onPress={handleRemoveLineItem}
				>
					{t('pos_cart.remove_line')}
				</Button>
			</View>
			{/* The body carries the row surface: the strip sits under it and shows only where the body has slid away. */}
			{pointer === 'coarse' ? (
				// The pan covers the whole row (a swipe on the name or the quantity reveals the
				// strip too); with `activeOffsetX` it never steals a tap from a cell's control.
				<GestureDetector gesture={pan}>
					<Animated.View className="bg-card min-h-row flex-row" style={style}>
						{children(wrapTotal)}
					</Animated.View>
				</GestureDetector>
			) : (
				<Animated.View className="bg-card min-h-row flex-row" style={style}>
					{children(wrapTotal)}
				</Animated.View>
			)}
		</View>
	);
}
