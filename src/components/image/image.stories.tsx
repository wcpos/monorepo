import * as React from 'react';
import { View } from 'react-native';
import { Image, ImageProps } from './image';

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
	},
};

/**
 *
 */
export const BasicUsage = (props: ImageProps) => {
	return (
		<View style={{ height: '150px', width: '50%' }}>
			<Image {...props} />
		</View>
	);
};
BasicUsage.args = {
	src: 'https://i.imgur.com/0y8Ftya.jpg',
};

/**
 *
 */
export const BrokenImage = (props: ImageProps) => {
	return (
		<View style={{ height: '150px', width: '50%' }}>
			<Image {...props} />
		</View>
	);
};
BrokenImage.args = {
	src: 'https://example.com/test.jpg',
};

/**
 *
 */
export const LocalAssets = (props: ImageProps) => {
	return <Image {...props} />;
};
LocalAssets.args = {
	// source: { require('@wcpos/common/src/assets/placeholder.png') },
};
