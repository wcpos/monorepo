import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { Switch, SwitchProps } from './switch';

export default {
	title: 'Components/Switch',
	component: Switch,
};

export const BasicUsage = (props: SwitchProps) => <Switch {...props} />;
BasicUsage.args = {
	onChecked: action('onChecked'),
};
