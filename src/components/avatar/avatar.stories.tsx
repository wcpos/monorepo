import * as React from 'react';
import { Avatar, AvatarProps } from './avatar';

export default {
	title: 'Components/Avatar',
	component: Avatar,
	argTypes: {
		size: {
			control: {
				type: 'inline-radio',
				options: ['default', 'small', 'large'],
			},
		},
	},
};

export const basicUsage = (props: AvatarProps) => <Avatar {...props} />;
basicUsage.args = {
	src: 'https://picsum.photos/200/200/?people',
	size: 'default',
};

export const brokenImage = (props: AvatarProps) => <Avatar {...props} />;
brokenImage.args = {
	src: 'https://example.com/pic.jpg',
	size: 'default',
};

export const withPlaceholder = (props: AvatarProps) => <Avatar {...props} />;
withPlaceholder.args = {
	src: 'https://example.com/pic.jpg',
	size: 'default',
	placeholder: 'PK',
};
