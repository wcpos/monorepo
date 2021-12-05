import * as React from 'react';
import { View, Dimensions, ViewStyle, StyleProp } from 'react-native';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
	// FadeInDown,
} from 'react-native-reanimated';
import get from 'lodash/get';
import useMeasure from '@wcpos/common/src/hooks/use-measure';
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
	 * Force popover to match the width of the triggering view.
	 *
	 * For example, this is used by the `Select` and `Combobox` components. Prefer using the `Select` and
	 * `Combobox` components instead of this property.
	 */
	matchWidth?: boolean;
	/**
	 *
	 */
	style?: StyleProp<ViewStyle>;
}

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
	matchWidth = false,
	style,
}: PopoverProps) => {
	const triggerRef = React.useRef<View>(null);
	const containerRef = React.useRef<View>(null);
	const [visible, setVisible] = React.useState(false);
	const {
		measurements: triggerRect,
		onLayout: onTriggerLayout,
		forceMeasure: forceTriggerMeasure,
	} = useMeasure({ ref: triggerRef });
	const {
		measurements: containerRect,
		onLayout: onContainerLayout,
		forceMeasure: forceContainerMeasure,
	} = useMeasure({ ref: containerRef });

	/**
	 * Re-measure the popover when onScroll called
	 */
	const scrollEvents = useScrollEvents();
	scrollEvents.subscribe(() => {
		forceTriggerMeasure();
	});

	/**
	 *
	 */
	const containerStyle = useAnimatedStyle(() => {
		if (!triggerRect.value || !containerRect.value) {
			return {}; // @TODO why is measurements.value undefined in react-native.
		}

		return getPopoverPosition(placement, triggerRect.value, containerRect.value);
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

	/**
	 * Special case for Pressables and Icons
	 * - clone and wrap touch events
	 */
	const triggerElement = React.useMemo(() => {
		if (React.Children.count(children) === 1) {
			const type = get(children, ['type', 'name']);
			if (type === 'Pressable' || type === 'Icon') {
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
		}

		return (
			<Pressable onPress={handlePress} onHoverIn={handleHoverIn} onHoverOut={handleHoverOut}>
				{children}
			</Pressable>
		);
	}, [children, handleHoverIn, handleHoverOut, handlePress]);

	return (
		<>
			<View ref={triggerRef} onLayout={onTriggerLayout}>
				{triggerElement}
			</View>
			{visible && (
				<Portal keyPrefix="Popover">
					<Backdrop
						invisible={!showBackdrop}
						clickThrough={clickThrough || trigger === 'hover'}
						onPress={handlePress}
					>
						<Styled.Container
							as={Animated.View}
							style={[containerStyle, { width: matchWidth ? triggerRect.value.width : undefined }]}
							ref={containerRef as any}
							onLayout={onContainerLayout}
							// entering={FadeInDown}
						>
							{withArrow && (isBottom(placement) || isRight(placement)) && arrow}
							<Styled.Popover style={style}>{content}</Styled.Popover>
							{withArrow && (isTop(placement) || isLeft(placement)) && arrow}
						</Styled.Container>
					</Backdrop>
				</Portal>
			)}
		</>
	);
};
