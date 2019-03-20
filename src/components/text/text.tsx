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

const defaultProps = {
	align: 'left',
	italic: false,
	size: 'normal',
	type: 'primary',
	uppercase: false,
	weight: 'normal',
	style: {},
};

const Text = ({ children, ...rest }: Props) => {
	return <StyledText {...rest}>{children}</StyledText>;
};

Text.defaultProps = defaultProps;

export default Text;
