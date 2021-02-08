import * as React from 'react';
import Image from '../image';

type Props = {
	src: string;
	size?: 'default' | 'small' | 'large';
	placeholder?: string | React.ReactNode;
};

const map = {
	default: { width: 50, height: 50 },
	small: { width: 20, height: 20 },
	large: { width: 100, height: 100 },
};

const Avatar = ({ size = 'default', ...props }: Props) => {
	return <Image border="circular" style={map[size]} {...props} />;
};

export default Avatar;
