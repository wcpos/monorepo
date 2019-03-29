import React from 'react';
import { GestureResponderEvent } from 'react-native';
import Touchable from '../touchable';
import Text from '../text';
import { ButtonView } from './styles';

export type Props = {
	background?: 'solid' | 'clear' | 'outline';
	children?: React.ReactNode;
	disabled?: boolean;
	icon?: string;
	iconPosition?: 'left' | 'right';
	loading?: boolean;
	onPress?: (event: GestureResponderEvent) => void;
	raised?: boolean;
	size?: 'normal' | 'large' | 'small';
	style?: import('react-native').ViewStyle;
	title?: string;
	type?:
		| 'attention'
		| 'critical'
		| 'info'
		| 'primary'
		| 'secondary'
		| 'success'
		| 'warning'
		| 'inverse';
};

const Button = ({
	background = 'solid',
	children,
	disabled,
	icon,
	iconPosition,
	loading,
	onPress,
	raised,
	size = 'normal',
	style,
	title,
	type = 'primary',
}: Props) => {
	let textType = type;
	if (background === 'solid') {
		textType = type === 'inverse' ? 'primary' : 'inverse';
	}
	return (
		<Touchable disabled={disabled} onPress={onPress}>
			<ButtonView type={type} background={background}>
				<Text type={textType} size={size}>
					{title}
				</Text>
			</ButtonView>
		</Touchable>
	);
};

export default Button;
