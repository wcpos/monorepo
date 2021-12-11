import * as React from 'react';
import { StyleProp, ViewStyle, GestureResponderEvent } from 'react-native';
import Text from '../text';
import Pressable from '../pressable';
import Icon from '../icon';
import * as Styled from './styles';

export type Props = {
	/**
	 *
	 */
	accessoryLeft?: React.ReactElement;
	/**
	 *
	 */
	accessoryRight?: React.ReactElement;
	/**
	 *
	 */
	background?: 'solid' | 'clear' | 'outline';
	/**
	 *
	 */
	children?: React.ReactNode;
	/**
	 *
	 */
	disabled?: boolean;
	/**
	 *
	 */
	loading?: boolean;
	/**
	 *
	 */
	onPress?: (event: GestureResponderEvent) => void;
	/**
	 *
	 */
	onPressIn?: (event: GestureResponderEvent) => void;
	/**
	 *
	 */
	onPressOut?: (event: GestureResponderEvent) => void;
	/**
	 *
	 */
	onLongPress?: (event: GestureResponderEvent) => void;
	/**
	 *
	 */
	raised?: boolean;
	/**
	 *
	 */
	size?: 'medium' | 'large' | 'small' | 'full';
	/**
	 *
	 */
	style?: StyleProp<ViewStyle>;
	/**
	 *
	 */
	title?: string | React.ReactElement;
	/**
	 *
	 */
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
	size = 'medium',
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
		if (loading) {
			return <Icon name="spinner" />;
		}

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
		<Styled.Background
			as={Pressable}
			background={background}
			disabled={disabled}
			style={style}
			type={type}
			size={size}
			onPress={onPress}
			onPressIn={onPressIn}
			onPressOut={onPressOut}
			onLongPress={onLongPress}
		>
			{/* {accessoryLeft && React.cloneElement(accessoryLeft, { color: '#FFF' })} */}
			{accessoryLeft && React.cloneElement(accessoryLeft)}
			{renderTitle()}
			{accessoryRight && React.cloneElement(accessoryRight, { color: '#FFF' })}
		</Styled.Background>
	);
};

export default Button;
