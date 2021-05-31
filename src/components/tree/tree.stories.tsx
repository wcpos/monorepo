import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { Tree, TreeProps } from './tree';

export default {
	title: 'Components/Tree',
	component: Tree,
};

export const BasicUsage = (props: TreeProps) => {
	return <Tree {...props} />;
};
BasicUsage.args = {
	data: {
		foo: 'bar',
		baz: {
			foo: 'bar',
		},
	},
};
