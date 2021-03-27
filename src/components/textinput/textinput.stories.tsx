import * as React from 'react';
import { action } from '@storybook/addon-actions';
import TextInput, { ITextInputProps } from './textinput';
import Portal from '../portal';

export default {
	title: 'Components/TextInput',
	component: TextInput,
	argTypes: {
		placeholder: 'Placeholder text',
		prefix: 'http://',
		action: 'Submit',
	},
};

export const basicUsage = ({ placeholder }: ITextInputProps) => (
	<TextInput placeholder={placeholder} />
);

export const withAction = ({ placeholder }: ITextInputProps) => (
	<TextInput placeholder={placeholder} onAction={action('submit')} />
);

export const withPrefix = ({ placeholder, prefix }: ITextInputProps) => (
	<TextInput
		placeholder={placeholder}
		// action={action}
		onAction={action('submit')}
		prefix={prefix}
	/>
);

export const clearable = ({ placeholder, prefix, clearable }: ITextInputProps) => (
	<TextInput
		placeholder={placeholder}
		// action={action}
		onAction={action('submit')}
		prefix={prefix}
		clearable
	/>
);

export const autosize = ({ placeholder, autosize }: ITextInputProps) => (
	<Portal.Host>
		<TextInput placeholder={placeholder} autosize />
	</Portal.Host>
);
