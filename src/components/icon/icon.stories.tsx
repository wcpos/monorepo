import React from 'react';
import { action } from '@storybook/addon-actions';
import { boolean, text, select } from '@storybook/addon-knobs';
import Icon from './';
import svgs from './svg';
import Table from '../table';
import Icon2 from './icon2';

const iconNames = Object.keys(svgs);

export default {
	title: 'Components/Icon',
};

export const basicUsage = () => (
	<Icon
		name={select('name', iconNames, 'cog')}
		// loading={boolean('loading', false)}
		disabled={boolean('disabled', false)}
		size={select('size', ['small', 'normal', 'large'], 'normal')}
	/>
);

export const allIcons = () => (
	<Table
		columns={[
			{ key: 'name', label: 'Name', cellDataGetter: ({ rowData }) => rowData },
			{ key: 'icon', label: 'Icon', cellRenderer: ({ rowData }) => <Icon name={rowData} /> },
		]}
		data={iconNames}
	/>
);
