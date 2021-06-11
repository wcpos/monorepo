import * as React from 'react';
import { TouchableWithoutFeedback, NativeSyntheticEvent, NativeTouchEvent } from 'react-native';
import isFunction from 'lodash/isFunction';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Styled from './styles';

export interface BackdropProps {
	/**
	 * Determines if Backdrop is visible or not.
	 */
	open: boolean;
	/**
	 * Determines if Popover is transparent or not.
	 */
	invisible?: boolean;
	/**
	 * If true, the popover and its backdrop won't be clickable and won't receive mouse events.
	 *
	 * For example, this is used by the `Tooltip` component. Prefer using the `Tooltip` component instead
	 * of this property.
	 */
	clickThrough?: boolean;
	/**
	 * Called when the Backdrop is pressed
	 */
	onPress?: (event: NativeSyntheticEvent<NativeTouchEvent>) => void;
	/**
	 * Backdrop children
	 */
	children?: React.ReactNode;
}

/**
 *
 */
export const Backdrop = ({
	open,
	invisible = false,
	clickThrough = false,
	onPress,
	children,
}: BackdropProps) => {
	// Fade in and out
	const opacity = useSharedValue(0);
	const animatedStyle = useAnimatedStyle(() => ({
		opacity: withTiming(opacity.value, { duration: 150 }),
	}));
	React.useEffect(() => {
		opacity.value = open ? 1 : 0;
	}, [open]);

	const handlePress = (event: NativeSyntheticEvent<NativeTouchEvent>) => {
		if (isFunction(onPress)) onPress(event);
	};

	const contentView = (
		<Styled.Backdrop
			as={Animated.View}
			style={[!invisible && animatedStyle]}
			pointerEvents={open && !clickThrough ? 'auto' : 'none'}
		>
			{children}
		</Styled.Backdrop>
	);

	return clickThrough ? (
		contentView
	) : (
		<TouchableWithoutFeedback onPress={handlePress}>{contentView}</TouchableWithoutFeedback>
	);
};
