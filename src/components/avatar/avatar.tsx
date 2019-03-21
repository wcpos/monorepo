import React from 'react';
import Image from '../image';

type Props = {
	src: string;
};

const Avatar = ({ src }: Props) => {
	return <Image src={src} circular={true} />;
};

export default Avatar;
