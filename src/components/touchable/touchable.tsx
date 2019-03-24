import React from 'react';
import {
	Platform,
	TouchableNativeFeedback,
	TouchableOpacity,
	View,
	GestureResponderEvent,
} from 'react-native';

type Props = {
	children: React.ReactNode;
	onPress?: (event: GestureResponderEvent) => void;
	disabled?: boolean;
	width?: number;
	style?: {};
	onLongPress?: (event: GestureResponderEvent) => void;
	delayPressIn?: number;
	noRipple?: boolean;
	borderlessRipple?: boolean;
	rippleColor?: string;
};

const Touchable = ({
	onPress,
	style,
	onLongPress,
	delayPressIn,
	noRipple,
	borderlessRipple,
	rippleColor = 'rgba(0, 0, 0, 0.32)',
	width,
	disabled,
	...rest
}: Props) => {
	const children = React.Children.only(rest.children);

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
				<View style={style}>{children}</View>
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
			<View style={style}>{children}</View>
		</TouchableOpacity>
	);
};

export default Touchable;
