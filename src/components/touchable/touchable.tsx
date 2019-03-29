import React from 'react';
import {
	GestureResponderEvent,
	Platform,
	TouchableNativeFeedback,
	TouchableOpacity,
	View,
} from 'react-native';

type Props = {
	borderlessRipple?: boolean;
	children: React.ReactElement<View>;
	delayPressIn?: number;
	disabled?: boolean;
	noRipple?: boolean;
	onLongPress?: (event: GestureResponderEvent) => void;
	onPress?: (event: GestureResponderEvent) => void;
	rippleColor?: string;
	style?: {};
	width?: number;
};

/**
 * A Touchable component simply handles the touch gestures on native platforms
 * on Android it will apply a ripple effect on the backrgound
 * on iOS and web it will change the opacity of the children
 *
 * A Touchable component must have a single child View component
 */
const Touchable = ({
	borderlessRipple,
	delayPressIn,
	disabled,
	noRipple,
	onLongPress,
	onPress,
	rippleColor = 'rgba(0, 0, 0, 0.32)',
	style,
	width,
	...props
}: Props) => {
	const children = React.Children.only(props.children);

	/**
	 * TouchableNativeFeedback.Ripple causes a crash on old Android versions,
	 * therefore only enable it on Android Lollipop and above.
	 */
	const supportsRippleEffect = () => {
		if (noRipple === true) {
			return false;
		}
		return Platform.OS === 'android' && Platform.Version >= 21;
	};

	if (supportsRippleEffect()) {
		let useForeground = TouchableNativeFeedback.canUseNativeForeground();
		if (borderlessRipple) {
			useForeground = false;
		}

		return (
			<TouchableNativeFeedback
				onPress={onPress}
				onLongPress={onLongPress}
				delayPressIn={delayPressIn}
				style={{ width }}
				useForeground={useForeground}
				background={TouchableNativeFeedback.Ripple(rippleColor, borderlessRipple)}
			>
				{children}
			</TouchableNativeFeedback>
		);
	}

	return (
		<TouchableOpacity
			disabled={disabled}
			onPress={onPress}
			onLongPress={onLongPress}
			delayPressIn={delayPressIn}
			activeOpacity={0.5}
			style={{ width }}
		>
			{children}
		</TouchableOpacity>
	);
};

export default Touchable;
