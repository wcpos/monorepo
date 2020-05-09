import React from 'react';
import { text, select } from '@storybook/addon-knobs';
import Avatar from './';

export default {
	title: 'Components/Avatar',
};

export const basicUsage = () => (
	<Avatar
		src={text('src', 'https://picsum.photos/200/200/?people')}
		size={select('size', ['', 'small', 'large'], '')}
	/>
);

export const brokenImage = () => (
	<Avatar
		src={text('src', 'https://example.com/pic.jpg')}
		size={select('size', ['', 'small', 'large'], '')}
	/>
);

export const withPlaceholder = () => (
	<Avatar
		src={text('src', 'https://example.com/pic.jpg')}
		size={select('size', ['', 'small', 'large'], '')}
		placeholder="PK"
	/>
);
