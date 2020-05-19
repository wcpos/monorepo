import React from 'react';
import { Pressable as RNPressable, GestureResponderEvent } from 'react-native';

interface Props {
	disabled?: boolean;
	noRipple?: boolean;
	onLongPress?: (event: GestureResponderEvent) => void;
	onPress?: (event: GestureResponderEvent) => void;
	onMouseEnter?: (event: GestureResponderEvent) => void;
	onMouseLeave?: (event: GestureResponderEvent) => void;
}

const Pressable: React.FC<Props> = (props) => {
	return <RNPressable {...props} />;
};

export default Pressable;
