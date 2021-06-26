import * as React from 'react';
import { Pressable, GestureResponderEvent } from 'react-native';
import Text from '../text';
import * as Styled from './styles';

export type Props = {
	accessoryLeft?: React.ReactElement;
	accessoryRight?: React.ReactElement;
	background?: 'solid' | 'clear' | 'outline';
	children?: React.ReactChild;
	disabled?: boolean;
	loading?: boolean;
	onPress?: (event: GestureResponderEvent) => void;
	onPressIn?: (event: GestureResponderEvent) => void;
	onPressOut?: (event: GestureResponderEvent) => void;
	onLongPress?: (event: GestureResponderEvent) => void;
	raised?: boolean;
	size?: 'normal' | 'large' | 'small';
	style?: import('react-native').ViewStyle;
	title?: string | React.ReactElement;
	type?: import('@wcpos/common/src/themes').ColorTypes;
};

const Button = ({
	accessoryLeft,
	accessoryRight,
	background = 'solid',
	children,
	disabled,
	loading,
	onPress,
	onPressIn,
	onPressOut,
	onLongPress,
	raised,
	size = 'normal',
	style,
	type = 'primary',
	...props
}: Props) => {
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
		// if (React.isValidElement(title) && title?.type?.name === 'Icon') {
		if (React.isValidElement(title)) {
			return React.cloneElement(title, { color: '#FFF' });
		}
		return title;
	};

	return (
		<Pressable
			onPress={onPress}
			onPressIn={onPressIn}
			onPressOut={onPressOut}
			delayLongPress={800}
			onLongPress={onLongPress}
		>
			{({ pressed }) => (
				<Styled.Background
					background={background}
					disabled={disabled}
					pressed={pressed}
					// @ts-ignore
					style={style}
					type={type}
					size={size}
				>
					{/* {accessoryLeft && React.cloneElement(accessoryLeft, { color: '#FFF' })} */}
					{accessoryLeft && React.cloneElement(accessoryLeft)}
					{renderTitle()}
					{accessoryRight && React.cloneElement(accessoryRight, { color: '#FFF' })}
				</Styled.Background>
			)}
		</Pressable>
	);
};

export default Button;
