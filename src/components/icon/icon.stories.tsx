import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { Icon } from './icon';
import svgs from './svg';
import Table from '../table';

type IIconProps = import('./icon').IIconProps;

const iconNames = Object.keys(svgs);

export default {
	title: 'Components/Icon',
	component: Icon,
	argTypes: {
		color: { control: 'color' },
		size: {
			control: {
				type: 'inline-radio',
				// options: [
				// 	'default', 'small', 'large'
				// ],
			},
		},
	},
};

export const basicUsage = ({ name, disabled, size }: IIconProps) => (
	<Icon
		name={name}
		// loading={loading}
		disabled={disabled}
		size={size}
	/>
);

export const pressableIcon = ({ name, disabled, size }: IIconProps) => (
	<Icon
		name={name}
		// loading={loading}
		disabled={disabled}
		size={size}
		onPress={action('onPress')}
	/>
);
