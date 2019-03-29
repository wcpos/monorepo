import React from 'react';
import { TextStyle } from 'react-native';
import { StyledText } from './styles';

export type Props = {
	align?: 'left' | 'right' | 'center' | 'justify';
	children: React.ReactNode;
	italic?: boolean;
	size?: 'normal' | 'large' | 'small';
	style?: TextStyle;
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
};

const Text = ({
	align = 'left',
	children,
	italic = false,
	size = 'normal',
	style = {},
	type = 'primary',
	uppercase = false,
	weight = 'normal',
}: Props) => {
	return (
		<StyledText
			align={align}
			italic={italic}
			size={size}
			style={style}
			type={type}
			uppercase={uppercase}
			weight={weight}
		>
			{children}
		</StyledText>
	);
};

export default Text;
