import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { Tag, ITagProps } from './tag';

export default {
	title: 'Components/Tag',
	component: Tag,
};

export const basicUsage = ({ disabled, label }: ITagProps & { label: string }) => (
	<Tag disabled={disabled}>{label}</Tag>
);
basicUsage.args = {
	label: 'Label',
};

export const closable = ({ disabled, label }: ITagProps & { label: string }) => (
	<Tag closable onClose={action('close')} disabled={disabled}>
		{label}
	</Tag>
);
closable.args = {
	label: 'Label',
};

export const skeleton = () => <Tag.Skeleton />;
