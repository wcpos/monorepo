import * as React from 'react';
import Image from '../image';

/**
 * Avatar properties
 */
export interface IAvatarProps {
	/** src description */
	src: string;
	/** size description */
	size?: 'default' | 'small' | 'large';
	/** placeholder description */
	placeholder?: string | React.ReactNode;
};

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
export const Avatar = ({ src, size = 'default', placeholder }: IAvatarProps) => {
	return <Image border="circular" src={src} style={map[size]} placeholder={placeholder} />;
};

export default Avatar;
