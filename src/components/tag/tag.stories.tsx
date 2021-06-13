import * as React from 'react';
import { action } from '@storybook/addon-actions';
import Tag from '.';
import { TagProps, TagSkeletonProps } from './tag';
import { TagGroupProps, TagGroupSkeletonProps } from './group';

export default {
	title: 'Components/Tag',
	component: Tag,
	subcomponents: { Skeleton: Tag.Skeleton },
};

export const BasicUsage = (props: TagProps) => <Tag {...props} />;
BasicUsage.args = {
	children: 'Label',
	onPress: action('Pressed'),
};

export const Removable = (props: TagProps) => <Tag {...props} />;
Removable.args = {
	children: 'Label',
	removable: true,
	onRemove: action('Remove'),
};

export const Skeleton = (props: TagSkeletonProps) => <Tag.Skeleton {...props} />;

export const Group = (props: TagGroupProps) => <Tag.Group {...props} />;
Group.args = {
	tags: [
		{ label: 'Tag 1', action: action('Tag 1 pressed') },
		{ label: 'Tag 2', action: action('Tag 2 pressed') },
		{ label: 'Tag 3', action: action('Tag 3 pressed') },
	],
};

export const GroupSkeleton = (props: TagGroupSkeletonProps) => <Tag.Group.Skeleton {...props} />;
GroupSkeleton.args = {
	numberOfTags: 2,
};
