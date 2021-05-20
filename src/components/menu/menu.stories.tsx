import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { Menu, MenuProps } from './menu';

export default {
	title: 'Components/Menu',
	component: Menu,
	subcomponents: { 'Menu.Item': Menu.Item },
};

export const BasicUsage = (props: MenuProps) => <Menu {...props} />;
BasicUsage.args = {
	items: ['Item 1', 'Item 2', 'Item 3', 'Item 4'],
	onSelect: action('Select'),
};

export const WithActions = (props: MenuProps) => <Menu {...props} />;
WithActions.args = {
	items: [
		{ label: 'Item 1', action: action('Item 1 Action') },
		{ label: 'Item 2', action: action('Item 2 Action') },
		{ label: 'Item 3', action: action('Item 3 Action') },
		{ label: 'Item 4', action: action('Item 4 Action') },
	],
};
