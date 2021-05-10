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
