import * as React from 'react';
import * as Styled from './styles';

/**
 * note: weird bug in storybook when importing * as Styled
 */

export interface TextProps {
	align?: 'left' | 'right' | 'center' | 'justify';
	children: React.ReactNode;
	italic?: boolean;
	onPress?: () => void;
	size?: 'normal' | 'large' | 'small';
	style?: import('react-native').TextStyle;
	type?:
		| 'attention'
		| 'critical'
		| 'info'
		| 'primary'
		| 'secondary'
		| 'success'
		| 'warning'
		| 'inverse';
	uppercase?: boolean;
	weight?: 'normal' | 'bold' | 'light';
}

export const Text = ({
	align = 'left',
	children,
	italic,
	onPress,
	size = 'normal',
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
			// style={style}
			type={type}
			uppercase={uppercase}
			weight={weight}
		>
			{children}
		</Styled.Text>
	);
};
