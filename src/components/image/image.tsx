import React from 'react';
import { ImgResource } from './resource';
import { Img } from './styles';

export type Props = {
	src: string;
	srcSet?: string;
	border?: 'rounded' | 'circular' | undefined;
	style?: import('react-native').ImageStyle;
};

export const Image = ({ src, srcSet, border, style }: Props) => {
	if (src) {
		ImgResource.read({ src, srcSet });
	}
	return <Img source={{ uri: src }} border={border} style={style} />;
};

export default Image;
