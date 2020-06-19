import React from 'react';
import { action } from '@storybook/addon-actions';
import { text } from '@storybook/addon-knobs';
import Tag from '.';

export default {
	title: 'Components/Tag',
};

export const basicUsage = () => <Tag>{text('children', 'Label')}</Tag>;

export const closable = () => (
	<Tag closable onClose={action('close')}>
		{text('children', 'Label')}
	</Tag>
);

export const skeleton = () => <Tag.Skeleton />;
