import * as React from 'react';
import { View, Dimensions, ViewStyle } from 'react-native';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useScrollEvents } from '../scrollview';
import Portal from '../portal';
import Pressable from '../pressable';
import Backdrop from '../backdrop';
import {
	PopoverPlacement,
	isBottom,
	isEnd,
	isLeft,
	isRight,
	isStart,
	isTop,
	getArrowAlign,
	getArrowDirection,
	getContainerAlign,
	getPopoverPosition,
} from './placements';
import Arrow from '../arrow';
import * as Styled from './styles';

export interface PopoverProps {
	/**
	 * The content which will trigger the Popover. The Popover will be anchored to this component.
	 */
	children: React.ReactNode;
	/**
	 * The content to display inside the Popover.
	 */
	content: React.ReactNode;
	/**
	 * Preferred placement of the Popover. The Popover will try to place itself according to this
	 * property. However, if there is not enough space left there to show up, it will show itself
	 * in opposite direction.
	 *
	 * For example, if we set `preferredPlacement="top"`, and there is not enough space for the Popover
	 * to show itself above the triggering view, it will show at the bottom of it.
	 */
	placement?: PopoverPlacement;
	/**
	 * Show arrow pointing to the target.
	 */
	withArrow?: boolean;
}

const initialLayout = {
	x: 0,
	y: 0,
	width: 0,
	height: 0,
	pageX: -1000,
	pageY: -1000,
};

/**
 *
 */
export const Popover = ({
	children,
	content,
	placement = 'bottom',
	withArrow = true,
}: PopoverProps) => {
	const layout = useSharedValue(initialLayout);
	const ref = React.useRef<View>(null);
	const scrollEvents = useScrollEvents();
	const [visible, setVisible] = React.useState(false);

	/**
	 *
	 */
	const measureTarget = React.useCallback(() => {
		ref.current?.measure((x, y, width, height, pageX, pageY) => {
			layout.value = { x, y, width, height, pageX, pageY };
		});
	}, [layout]);

	/**
	 * Re-measure the popover when the window size changes
	 */
	React.useEffect(() => {
		Dimensions.addEventListener('change', measureTarget);

		return () => {
			Dimensions.removeEventListener('change', measureTarget);
		};
	}, [measureTarget]);

	/**
	 * Re-measure the popover when onScroll called
	 */
	scrollEvents.subscribe(() => {
		measureTarget();
	});

	/**
	 *
	 */
	const animatedStyle = useAnimatedStyle(() => {
		const { width, height, pageX, pageY } = layout.value;
		return {
			width,
			height,
			transform: [{ translateX: pageX }, { translateY: pageY }],
			// opacity: withTiming(opacity.value, { duration: 150 }),
		};
	});

	const arrow = (
		<Arrow
			color="white"
			direction={getArrowDirection(placement)}
			style={[getArrowAlign(placement), { zIndex: 10 }]}
		/>
	);

	const handlePress = React.useCallback(() => {
		setVisible((prev) => !prev);
	}, []);

	return (
		<View ref={ref} onLayout={measureTarget}>
			<Pressable onPress={handlePress}>{children}</Pressable>
			{visible && (
				<Portal keyPrefix="Popover">
					<Backdrop clickThrough invisible />
					<Styled.TriggerArea
						pointerEvents="none"
						style={[animatedStyle, getContainerAlign(placement)]}
					>
						<Styled.Container style={[getPopoverPosition(placement)]}>
							{withArrow && (isBottom(placement) || isRight(placement)) && arrow}
							<Styled.Popover>{content}</Styled.Popover>
							{withArrow && (isTop(placement) || isLeft(placement)) && arrow}
						</Styled.Container>
					</Styled.TriggerArea>
				</Portal>
			)}
		</View>
	);
};
