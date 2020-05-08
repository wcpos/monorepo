import React from 'react';
import Image from '../image';

type Props = {
	src: string;
	size?: 'default' | 'small' | 'large';
};

const map = {
	default: { width: 50, height: 50 },
	small: { width: 20, height: 20 },
	large: { width: 100, height: 100 },
};

const Avatar = ({ src, size = 'default' }: Props) => {
	return <Image src={src} border="circular" style={map[size]} />;
};

export default Avatar;
