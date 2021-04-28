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

export const closable = (props: TagProps) => <Tag {...props}>{props.children}</Tag>;
closable.args = {
	children: 'Label',
	removable: true,
	onRemove: action('Remove'),
};

export const skeleton = () => <Tag.Skeleton />;
