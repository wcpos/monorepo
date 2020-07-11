import React from 'react';
import { Pressable as RNPressable, GestureResponderEvent } from 'react-native';

interface Props {
	children: React.ReactNode;
	disabled?: boolean;
	noRipple?: boolean;
	onLongPress?: (event: GestureResponderEvent) => void;
	onPress?: (event: GestureResponderEvent) => void;
	onMouseEnter?: (event: GestureResponderEvent) => void;
	onMouseLeave?: (event: GestureResponderEvent) => void;
}

const Pressable = ({ children, ...props }: Props) => {
	return (
		<RNPressable
			style={({ pressed }) => ({
				opacity: pressed ? 0.5 : 1,
				backgroundColor: pressed ? 'red' : 'orange',
			})}
			{...props}
		>
			{children}
		</RNPressable>
	);
};

export default Pressable;
