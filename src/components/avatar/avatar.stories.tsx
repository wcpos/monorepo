import * as React from 'react';
import Avatar from './avatar';

type IAvatarProps = import('./avatar').IAvatarProps

export default {
	title: 'Components/Avatar',
	component: Avatar,
	argTypes: {
		size: {
			control: {
				type: 'inline-radio',
				options: [
					'default', 'small', 'large'
				],
			},
		},
	}
};

export const basicUsage = ({ src, size }: IAvatarProps) => (
	<Avatar
	src={src}
	size={size}
	/>
);
basicUsage.args = {
	src: 'https://picsum.photos/200/200/?people',
	size: 'default'
}

export const brokenImage = ({ src, size }: IAvatarProps) => (
	<Avatar
	src={src}
	size={size}
	/>
);
brokenImage.args = {
	src: 'https://example.com/pic.jpg',
	size: 'default'
}

export const withPlaceholder = ({ src, size, placeholder }: IAvatarProps) => (
	<Avatar
		src={src}
		size={size}
		placeholder={placeholder}
	/>
);
withPlaceholder.args = {
	src: 'https://example.com/pic.jpg',
	size: 'default',
	placeholder: 'PK'
}