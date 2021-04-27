import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { Tag, TagProps } from './tag';

export default {
	title: 'Components/Tag',
	component: Tag,
};

export const basicUsage = (props: TagProps) => (
	<>
		<Tag {...props}>Tag 1</Tag>
		<Tag {...props}>Tag 2</Tag>
		<Tag {...props}>Tag 3</Tag>
	</>
);

export const closable = ({ disabled, label }: TagProps & { label: string }) => (
	<Tag removable onClose={action('close')} disabled={disabled}>
		{label}
	</Tag>
);
closable.args = {
	label: 'Label',
};

export const skeleton = () => <Tag.Skeleton />;
