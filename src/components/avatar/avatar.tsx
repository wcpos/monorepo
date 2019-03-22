import React from 'react';
import Image from '../image';

type Props = {
	src: string;
	size?: 'small' | 'large';
};

const Avatar = ({ src, size }: Props) => {
	let style = { width: 50, height: 50 };
	if (size === 'small') {
		style = { width: 20, height: 20 };
	}
	if (size === 'large') {
		style = { width: 100, height: 100 };
	}

	return <Image src={src} border="circular" style={style} />;
};

export default Avatar;
