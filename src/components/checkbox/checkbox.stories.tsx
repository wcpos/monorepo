import * as React from 'react';
import { action } from '@storybook/addon-actions';
import Checkbox from './checkbox';

type ICheckboxProps = import('./checkbox').ICheckboxProps;

export default {
	title: 'Components/Checkbox',
	component: Checkbox
};

export const basicUsage = ({ label, checked, hasError, disabled }: ICheckboxProps) => (
	<Checkbox
		label={label}
		checked={checked}
		onChange={action('onChange')}
		hasError={hasError}
		disabled={disabled}
		name="test"
	/>
);
basicUsage.args = {
	label: 'Label',
	checked: true,
	hasError: false,
	disabled: false
}

export const withInfo = ({ label, checked, info }: ICheckboxProps) => (
	<Checkbox
		label={label}
		info={info}
		checked={checked}
		onChange={action('onChange')}
	/>
);
withInfo.args = {
	label: 'Label',
	info: 'Lorem ipsum dolor sit amet',
	checked: true,
}