import * as React from 'react';
import {
	TouchableWithoutFeedback,
	Animated,
	Easing,
	NativeSyntheticEvent,
	NativeTouchEvent,
} from 'react-native';
import isFunction from 'lodash/isFunction';
import useAnimation from '@wcpos/common/src/hooks/use-animation';
import * as Styled from './styles';

export interface BackdropProps {
	/**
	 * Determines if Backdrop is visible or not.
	 */
	open: boolean;
	/**
	 * Determines if Popover is transparent or not.
	 */
	invisible: boolean;
	/**
	 * If true, the popover and its backdrop won't be clickable and won't receive mouse events.
	 *
	 * For example, this is used by the `Tooltip` component. Prefer using the `Tooltip` component instead
	 * of this property.
	 */
	clickThrough: boolean;
	/**
	 * Called when the Backdrop is pressed
	 */
	onPress: (event: NativeSyntheticEvent<NativeTouchEvent>) => void;
	/**
	 * Backdrop children
	 */
	children?: React.ReactChildren;
}

/**
 *
 */
export const Backdrop = ({ open, invisible, clickThrough, onPress, children }: BackdropProps) => {
	const animation = {
		duration: {
			default: 300,
			shorter: 150,
			longer: 400,
		},
		easing: {
			enter: Easing.out(Easing.ease), // Ease out
			exit: Easing.ease, // Ease in
			move: Easing.inOut(Easing.ease), // Ease in-out
		},
	};

	const anim = useAnimation({
		toValue: open ? 1 : 0,
		type: 'timing',
		easing: animation.easing.move,
		duration: animation.duration.shorter,
		useNativeDriver: true,
	});

	const handlePress = (event: NativeSyntheticEvent<NativeTouchEvent>) => {
		if (isFunction(onPress)) onPress(event);
	};

	const contentView = (
		<Styled.Backdrop
			as={Animated.View}
			style={[!invisible && { opacity: anim }]}
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
