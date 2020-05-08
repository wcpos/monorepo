import React from 'react';
import { text, select } from '@storybook/addon-knobs';
import Image from './';

export default {
	title: 'Components/Image',
};

export const basicUsage = () => (
	<Image
		src={text('src', 'https://picsum.photos/200/300/?random')}
		style={{ width: 300, height: 200 }}
		border={select('border', ['none', 'rounded', 'circular'], 'none')}
	/>
);

export const brokenImage = () => (
	<Image
		src={text('src', 'https://example.com/image.jpg')}
		style={{ width: 300, height: 200 }}
		border={select('border', ['none', 'rounded', 'circular'], 'none')}
	/>
);
