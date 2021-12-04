import * as React from 'react';
import { View, Dimensions, ViewStyle, Text } from 'react-native';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
	SlideInDown,
} from 'react-native-reanimated';
import get from 'lodash/get';
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
	 * Method for activating the Popover.
	 */
	trigger?: 'press' | 'longpress' | 'hover';
	/**
	 * Show arrow pointing to the target.
	 */
	withArrow?: boolean;
	/**
	 * Show backdrop behind the Popover.
	 */
	showBackdrop?: boolean;
	/**
	 * If true, the popover and its backdrop won't be clickable and won't receive mouse events.
	 *
	 * For example, this is used by the `Tooltip` component. Prefer using the `Tooltip` component instead
	 * of this property.
	 */
	clickThrough?: boolean;
	/**
	 *
	 */
	style?: ViewStyle;
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
	trigger = 'press',
	withArrow = true,
	showBackdrop = false,
	clickThrough = false,
	style,
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
		if (layout.value && layout.value.width) {
			const { width, height, pageX, pageY } = layout.value;
			return {
				width,
				height,
				transform: [{ translateX: pageX }, { translateY: pageY }],
				// opacity: withTiming(opacity.value, { duration: 150 }),
			};
		}
		return {};
	});

	const arrow = (
		<Arrow
			color={style?.backgroundColor || '#fff'}
			direction={getArrowDirection(placement)}
			style={[getArrowAlign(placement), { zIndex: 10 }]}
		/>
	);

	const handlePress = React.useCallback(() => {
		setVisible((prev) => !prev);
	}, []);

	const handleHoverIn = React.useCallback(() => {
		if (trigger === 'hover') setVisible(true);
	}, [trigger]);

	const handleHoverOut = React.useCallback(() => {
		if (trigger === 'hover') setVisible(false);
	}, [trigger]);

	const triggerElement = React.useMemo(() => {
		if (React.Children.count(children) === 1 && get(children, ['type', 'name']) === 'Pressable') {
			const child = React.Children.only(children) as React.ReactElement;
			const { onPress, onHoverIn, onHoverOut } = child.props;
			return React.cloneElement(child, {
				onPress: (event: any) => {
					handlePress();
					onPress?.(event);
				},
				onHoverIn: (event: any) => {
					handleHoverIn();
					onHoverIn?.(event);
				},
				onHoverOut: (event: any) => {
					handleHoverOut();
					onHoverOut?.(event);
				},
			});
		}

		return (
			<Pressable onPress={handlePress} onHoverIn={handleHoverIn} onHoverOut={handleHoverOut}>
				{children}
			</Pressable>
		);
	}, [children, handleHoverIn, handleHoverOut, handlePress]);

	return (
		<View ref={ref} onLayout={measureTarget}>
			{triggerElement}
			{visible && (
				<Portal keyPrefix="Popover">
					<Backdrop invisible={!showBackdrop} clickThrough={clickThrough} onPress={handlePress} />
					<Styled.AnimatedTriggerDuplicate
						as={Animated.View}
						pointerEvents="none"
						style={[animatedStyle, getContainerAlign(placement)]}
					>
						<Styled.Container
							// as={Animated.View}
							// entering={SlideInDown}
							style={[getPopoverPosition(placement)]}
						>
							{withArrow && (isBottom(placement) || isRight(placement)) && arrow}
							<Styled.Popover
								style={style}
								// pointerEvents="auto"
							>
								{content}
							</Styled.Popover>
							{withArrow && (isTop(placement) || isLeft(placement)) && arrow}
						</Styled.Container>
					</Styled.AnimatedTriggerDuplicate>
				</Portal>
			)}
		</View>
	);
};
