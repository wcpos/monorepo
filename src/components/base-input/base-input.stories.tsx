import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { BaseInput, BaseInputProps } from './base-input';
import { BaseInputContainer, BaseInputContainerProps } from './base-input-container';
import TextInput from '../textinput';

export default {
	title: 'Components/BaseInput',
	component: BaseInput,
	subcomponents: { BaseInputContainer },
};

export const BasicUsage = (props: BaseInputProps) => {
	return <BaseInput {...props} />;
};
BasicUsage.args = {
	value: '',
	placeholder: 'Placeholder',
	onPress: () => action('Base Input Press'),
};

export const WithContainer = (props: BaseInputContainerProps) => {
	return <BaseInputContainer {...props} />;
};
WithContainer.args = {
	label: 'Label',
	value: '',
	placeholder: 'Placeholder',
	onPress: () => action('Base Input Press'),
	helpText: 'Help text',
	error: 'Error text',
};

export const TextInputWithContainer = () => {
	return <TextInput label="Label" />;
};
