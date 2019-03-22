import React from 'react';
import Image from '../image';

type Props = {
	src: string;
	size?: 'small' | 'large';
};

const Avatar = ({ src, size }: Props) => {
	let style = { width: '50px', height: '50px' };
	if (size === 'small') {
		style = { width: '20px', height: '20px' };
	}
	if (size === 'large') {
		style = { width: '100px', height: '100px' };
	}

	return <Image src={src} border="circular" style={style} />;
};

export default Avatar;
