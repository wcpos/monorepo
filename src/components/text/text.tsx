import React from 'react';
import { TextStyle } from 'react-native';
import { StyledText } from './styles';

/**
 * note: weird bug in storybook when importing * as Styled
 */

export type Props = {
	align?: 'left' | 'right' | 'center' | 'justify';
	children: React.ReactNode;
	italic?: boolean;
	onPress?: () => void;
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

const Text: React.FC<Props> = ({
	align = 'left',
	children,
	italic,
	onPress,
	size = 'normal',
	style = {},
	type = 'primary',
	uppercase,
	weight = 'normal',
}) => {
	return (
		<StyledText
			align={align}
			italic={italic}
			onPress={onPress}
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
