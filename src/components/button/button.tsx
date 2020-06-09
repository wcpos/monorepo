import React from 'react';
import { GestureResponderEvent } from 'react-native';
import Touchable from '../touchable';
import Text from '../text';
import * as Styled from './styles';

export type Props = {
	accessoryLeft?: React.ReactNode;
	accessoryRight?: React.ReactNode;
	background?: 'solid' | 'clear' | 'outline';
	children?: React.ReactChild;
	disabled?: boolean;
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

const Button: React.FC<Props> = ({
	accessoryLeft,
	accessoryRight,
	background = 'solid',
	children,
	disabled,
	loading,
	onPress,
	raised,
	size = 'normal',
	style,
	type = 'primary',
	...props
}) => {
	const title = props.title || children;
	let textType = type;
	if (background === 'solid') {
		textType = type === 'inverse' ? 'primary' : 'inverse';
	}

	const renderTitle = () => {
		if (typeof title === 'string') {
			return (
				<Text type={textType} size={size}>
					{title}
				</Text>
			);
		}
		if (React.isValidElement(title) && title?.type?.name === 'Icon') {
			return React.cloneElement(title, { color: '#FFF' });
		}
		return title;
	};

	return (
		<Touchable
			disabled={disabled}
			onPress={onPress}
			// style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}
		>
			<Styled.Background type={type} background={background} style={style}>
				{accessoryLeft && React.cloneElement(accessoryLeft, { color: '#FFF' })}
				{renderTitle()}
				{accessoryRight && React.cloneElement(accessoryRight, { color: '#FFF' })}
			</Styled.Background>
		</Touchable>
	);
};

export default Button;
