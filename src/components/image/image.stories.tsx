import * as React from 'react';
import { SuspendedImage as Image, ImageProps } from './image';
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
export const BasicUsage = (props: ImageProps) => {
	return <Image {...props} />;
};
BasicUsage.args = {
	src: 'https://picsum.photos/200/300/?random',
};

/**
 *
 */
export const BrokenImage = (props: ImageProps) => <Image {...props} />;
BrokenImage.args = {
	src: 'https://example.com/image.jpg',
};

/**
 *
 */
export const WithPlaceholder = (props: ImageProps) => <Image {...props} />;
WithPlaceholder.args = {
	src: 'https://example.com/image.jpg',
	placeholder: 'Joe Bloggs',
};
