import * as React from 'react';
import {
	Pressable as RNPressable,
	GestureResponderEvent,
	StyleProp,
	ViewStyle,
} from 'react-native';

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
	// onMouseEnter?: (event: GestureResponderEvent) => void;
	/**
	 *
	 */
	// onMouseLeave?: (event: GestureResponderEvent) => void;
	/**
	 *
	 */
	style?: StyleProp<ViewStyle>;
}

export const Pressable = ({ children, disabled, onLongPress, onPress, style }: PressableProps) => {
	return (
		<RNPressable
			disabled={disabled}
			onLongPress={onLongPress}
			onPress={onPress}
			style={({ pressed }: { pressed: boolean }) => [
				{
					backgroundColor: pressed ? 'red' : 'blue',
				},
				style,
			]}
		>
			{children}
		</RNPressable>
	);
};
