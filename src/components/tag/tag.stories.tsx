import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { text, boolean } from '@storybook/addon-knobs';
import Tag from '.';

export default {
	title: 'Components/Tag',
};

export const basicUsage = () => (
	<Tag disabled={boolean('disabled')}>{text('children', 'Label')}</Tag>
);

export const closable = () => (
	<Tag closable onClose={action('close')} disabled={boolean('disabled')}>
		{text('children', 'Label')}
	</Tag>
);

export const skeleton = () => <Tag.Skeleton />;
