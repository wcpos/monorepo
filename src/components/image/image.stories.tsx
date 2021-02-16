import * as React from 'react';
import { text, select } from '@storybook/addon-knobs';
import Image from './';
import Text from '../text';

export default {
	title: 'Components/Image',
	component: Image,
	argTypes: {
		border: {
			control: {
				type: 'inline-radio',
				options: [
					'none', 'rounded', 'circular'
				],
			},
		},
	}
};

/**
 *
 */
export const basicUsage = ({ border, ...rest }) => {
	<Image
		// src={text('src', 'https://picsum.photos/200/300/?random')}
		// style={{ width: 300, height: 200 }}
		// border={select('border', ['none', 'rounded', 'circular'], 'none')}
		border={border}
		{...rest}
	/>
};
basicUsage.args = {
	src: 'https://picsum.photos/200/300/?random',
	style: { width: 300, height: 200 },
	border: 'none'
}

/**
 *
 */
export const brokenImage = () => (
	<Image
		src={text('src', 'https://example.com/image.jpg')}
		style={{ width: 300, height: 200 }}
		// border={select('border', ['none', 'rounded', 'circular'], 'none')}
	/>
);
brokenImage.args = {
	// src: 'https://picsum.photos/200/300/?random',
	// style: { width: 300, height: 200 },
	border: 'circular'
}

/**
 *
 */
export const withPlaceholder = () => (
	<Image
		src={text('src', 'https://example.com/image.jpg')}
		style={{ width: 300, height: 200 }}
		border={select('border', ['none', 'rounded', 'circular'], 'none')}
		placeholder={<Text>broken</Text>}
	/>
);
