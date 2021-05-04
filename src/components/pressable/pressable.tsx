import * as React from 'react';
import {
	Pressable as RNPressable,
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
	onHoverIn?: (event: GestureResponderEvent) => void;
	/**
	 *
	 */
	onHoverOut?: (event: GestureResponderEvent) => void;
	/**
	 *
	 */
	style?: StyleProp<ViewStyle>;
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
	const [hovered, setHovered] = React.useState(false);

	const handleHoverIn = (event) => {
		setHovered(true);
		if (onHoverIn) {
			onHoverIn(event);
		}
	};

	const handleHoverOut = (event) => {
		setHovered(false);
		if (onHoverOut) {
			onHoverOut(event);
		}
	};

	return (
		<RNPressable
			disabled={disabled}
			onLongPress={onLongPress}
			onPress={onPress}
			// @ts-ignore
			onHoverIn={handleHoverIn}
			onHoverOut={handleHoverOut}
			style={({ pressed }: { pressed: boolean }) => [
				{
					// @ts-ignore
					backgroundColor: hovered ? (pressed ? '#DDD' : '#EEE') : '#F5F5F5',
				},
				style,
			]}
		>
			{children}
		</RNPressable>
	);
};
