import * as React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Image from '../image';

/**
 * Avatar properties
 */
export interface AvatarProps {
	/** src description */
	src: string;
	/** size description */
	size?: 'default' | 'small' | 'large';
	/** placeholder description */
	placeholder?: string | React.ReactNode;
	/**
	 *
	 */
	style?: StyleProp<ViewStyle>;
}

/**
 * Size map
 */
const map = {
	default: { width: 50, height: 50 },
	small: { width: 20, height: 20 },
	large: { width: 100, height: 100 },
};

/**
 * Avatar
 */
export const Avatar = ({ src, size = 'default', placeholder, style }: AvatarProps) => {
	return <Image border="circular" src={src} placeholder={placeholder} style={[map[size], style]} />;
};
