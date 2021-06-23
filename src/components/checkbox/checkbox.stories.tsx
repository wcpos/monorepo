import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { Checkbox, CheckboxProps } from './checkbox';

export default {
	title: 'Components/Checkbox',
	component: Checkbox,
};

export const BasicUsage = (props: CheckboxProps) => {
	const [checked, setChecked] = React.useState(props.checked);
	return <Checkbox {...props} checked={checked} onChange={setChecked} />;
};
BasicUsage.args = {
	label: 'Label',
	checked: true,
	hasError: false,
	disabled: false,
	onChange: action('Change'),
};

export const WithInfo = (props: CheckboxProps) => {
	const [checked, setChecked] = React.useState(props.checked);
	return <Checkbox {...props} checked={checked} onChange={setChecked} />;
};
WithInfo.args = {
	label: 'Label',
	info: 'Lorem ipsum dolor sit amet',
	checked: true,
};

export const Uncontrolled: React.FC = () => <Checkbox label="Label" />;
