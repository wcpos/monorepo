import * as React from 'react';
import { ActivityIndicator, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from 'styled-components/native';

export interface LoaderProps {
	/**
	 *
	 */
	size?: 'small' | 'large';
	/**
	 *
	 */
	type?: import('@wcpos/common/src/themes').ColorTypes;
	/**
	 *
	 */
	style?: StyleProp<ViewStyle>;
}

const Loader = ({ size, type, style, ...props }: LoaderProps) => {
	const theme = useTheme();
	const color = theme.colors[type || 'primary'];

	return <ActivityIndicator size={size} color={color} style={style} {...props} />;
};

export default Loader;
