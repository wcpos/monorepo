import * as React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { decode } from 'html-entities';
import * as Styled from './styles';

export interface TextProps {
	/**
	 *
	 */
	align?: 'left' | 'right' | 'center' | 'justify';
	/**
	 *
	 */
	children: React.ReactNode;
	/**
	 *
	 */
	italic?: boolean;
	/**
	 *
	 */
	onPress?: () => void;
	/**
	 *
	 */
	size?: 'medium' | 'large' | 'small';
	/**
	 *
	 */
	style?: StyleProp<ViewStyle>;
	/**
	 *
	 */
	type?: import('@wcpos/common/src/themes').ColorTypes;
	/**
	 *
	 */
	uppercase?: boolean;
	/**
	 *
	 */
	weight?: 'normal' | 'bold' | 'light';
}

export const Text = ({
	align = 'left',
	children,
	italic,
	onPress,
	size = 'medium',
	style = {},
	type = 'primary',
	uppercase,
	weight = 'normal',
}: TextProps) => {
	return (
		<Styled.Text
			align={align}
			italic={italic}
			onPress={onPress}
			size={size}
			// @ts-ignore
			style={style}
			type={type}
			uppercase={uppercase}
			weight={weight}
		>
			{typeof children === 'string' ? decode(children) : children}
		</Styled.Text>
	);
};
