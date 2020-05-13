import React from 'react';
import { action } from '@storybook/addon-actions';
import { boolean, text, select } from '@storybook/addon-knobs';
import Icon from './';
import iconsMap from './icons.json';
import Table from '../table';
import Icon2 from './icon2';

const iconNames = Object.keys(iconsMap);

export default {
	title: 'Components/Icon',
};

export const basicUsage = () => (
	<Icon
		name={select('name', iconNames, 'cog')}
		// loading={boolean('loading', false)}
		disabled={boolean('disabled', false)}
		raised={boolean('raised', false)}
	/>
);

export const allIcons = () => (
	<Table
		columns={[
			{ key: 'name', label: 'Name', cellDataGetter: ({ rowData }) => rowData },
			{ key: 'icon', label: 'Icon', cellRenderer: ({ rowData }) => <Icon name={rowData} /> },
		]}
		items={iconNames}
	/>
);

export const iconButton = () => (
	<Icon
		name={text('name', 'cog')}
		onPress={action('pressed')}
		// loading={boolean('loading', false)}
		disabled={boolean('disabled', false)}
		raised={boolean('raised', false)}
	/>
);

export const svgIcon = () => <Icon2 />;
