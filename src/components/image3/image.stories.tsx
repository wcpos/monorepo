import * as React from 'react';
import { Image, ImageProps } from './image';

export default {
	title: 'Components/Image3',
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
	src: 'https://i.imgur.com/0y8Ftya.jpg',
};

/**
 *
 */
export const LocalAssets = (props: ImageProps) => {
	return <Image {...props} />;
};
LocalAssets.args = {
	source: { require('@wcpos/common/src/assets/placeholder.png') },
};
