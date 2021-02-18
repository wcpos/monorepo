import * as React from 'react';
import { SuspendedImage as Image, IImageProps } from './image';
import Text from '../text';

export default {
	title: 'Components/Image',
	component: Image,
	argTypes: {
		border: {
			control: {
				type: 'inline-radio',
				options: ['none', 'rounded', 'circular'],
			},
		},
		style: { width: 300, height: 200 },
	},
};

/**
 *
 */
export const basicUsage = ({ src, style, border }: IImageProps) => {
	<Image src={src} style={style} border={border} />;
};
basicUsage.args = {
	src: 'https://picsum.photos/200/300/?random',
};

/**
 *
 */
export const brokenImage = ({ src, style, border }: IImageProps) => (
	<Image src={src} style={style} border={border} />
);
brokenImage.args = {
	src: 'https://example.com/image.jpg',
};

/**
 *
 */
export const withPlaceholder = ({ src, style, border }: IImageProps) => (
	<Image src={src} style={style} border={border} />
);
brokenImage.args = {
	src: 'https://example.com/image.jpg',
};
