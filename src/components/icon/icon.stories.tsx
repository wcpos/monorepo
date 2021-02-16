import * as React from 'react';
import Icon from './icon';
import svgs from './svg';
import Table from '../table';

type IIconProps = import('./icon').IIconProps;

const iconNames = Object.keys(svgs);

export default {
	title: 'Components/Icon',
	component: Icon,
	argTypes: {
		size: {
			control: {
				type: 'inline-radio',
				// options: [
				// 	'default', 'small', 'large'
				// ],
			},
		},
	}
};

export const basicUsage = ({ name, disabled, size}: IIconProps) => (
	<Icon
		name={name}
		// loading={loading}
		disabled={disabled}
		size={size}
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
