import React from 'react';
import { GestureResponderEvent } from 'react-native';
import Touchable from '../touchable';
import Text from '../text';

type Props = {
	children?: React.ReactNode;
	title?: string;
	disabled?: boolean;
	loading?: boolean;
	raised?: boolean;
	type?: 'solid' | 'clear' | 'outline';
	onPress?: (event: GestureResponderEvent) => void;
};

const Button = ({ children, disabled, title, onPress, type = 'solid' }: Props) => {
	return (
		<Touchable disabled={disabled} onPress={onPress} type={type}>
			<Text>{title}</Text>
		</Touchable>
	);
};

export default Button;
