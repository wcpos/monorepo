import * as React from 'react';
import {
	Pressable as RNWPressable,
	GestureResponderEvent,
	StyleProp,
	ViewStyle,
} from 'react-native';
import { useTheme } from 'styled-components/native';

export interface PressableProps {
	/**
	 *
	 */
	children: React.ReactNode;
	/**
	 *
	 */
	disabled?: boolean;
	// noRipple?: boolean;
	/**
	 *
	 */
	onLongPress?: (event: GestureResponderEvent) => void;
	/**
	 *
	 */
	onPress?: (event: GestureResponderEvent) => void;
	/**
	 *
	 */
	onHoverIn?: (event: PointerEvent) => void;
	/**
	 *
	 */
	onHoverOut?: (event: PointerEvent) => void;
	/**
	 *
	 */
	style?: StyleProp<ViewStyle>;
}

/**
 * The state object passed to function values of children and style reflects the
 * current state of the user interaction with the view.
 */
interface PressableStateCallbackType {
	focused: boolean;
	hovered: boolean;
	pressed: boolean;
}

export const Pressable = ({
	children,
	disabled,
	onLongPress,
	onPress,
	onHoverIn,
	onHoverOut,
	style,
}: PressableProps) => {
	const theme = useTheme();

	return (
		<RNWPressable
			disabled={disabled}
			onLongPress={onLongPress}
			onPress={onPress}
			// @ts-ignore
			onHoverIn={onHoverIn}
			onHoverOut={onHoverOut}
			// @ts-ignore
			style={({ hovered, pressed }: PressableStateCallbackType) => [
				{
					// @ts-ignore
					backgroundColor: hovered ? (pressed ? '#DDD' : '#EEE') : '#F5F5F5',
				},
				style,
			]}
		>
			{children}
		</RNWPressable>
	);
};
