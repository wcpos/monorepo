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
import { Text } from '@wcpos/components/text';
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
	const [open, setOpen] = React.useState(false);
	const swiped = useSharedValue(false);
	const offset = useSharedValue(0);
	const reduced = useReducedMotion();
	const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
	const settle = (x: number) => {
		offset.set(reduced ? x : withSpring(x, { overshootClamping: true }));
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
								if (!open) settle(-14);
							}
						: undefined
				}
				onHoverOut={
					pointer === 'fine'
						? () => {
								if (!open) settle(0);
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
			</Pressable>
		);
		return pointer === 'coarse' ? (
			<GestureDetector gesture={pan}>{target}</GestureDetector>
		) : (
			target
		);
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
				className="absolute inset-y-0 right-0 flex-row items-center gap-2"
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
					variant="ghost"
					testID="cart-line-remove"
					className="h-tile"
					onPress={handleRemoveLineItem}
				>
					<Text className="text-destructive">{t('pos_cart.remove_line')}</Text>
				</Button>
			</View>
			{/* The body carries the row surface: the strip sits under it and shows only where the body has slid away. */}
			<Animated.View className="bg-card min-h-row flex-row" style={style}>
				{children(wrapTotal)}
			</Animated.View>
		</View>
	);
}
