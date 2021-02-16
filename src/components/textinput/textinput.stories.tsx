import * as React from 'react';
import { action } from '@storybook/addon-actions';
import TextInput, { Props } from './textinput';
import Portal from '../portal';

export default {
	title: 'Components/TextInput',
	component: TextInput,
	argTypes: {
		placeholder: 'Placeholder text',
		prefix: 'http://',
		action: 'Submit'
	}
};

export const basicUsage = ({ placeholder }: Props) => <TextInput placeholder={placeholder} />;

export const withAction = ({ placeholder, action }: Props) => (
	<TextInput
	placeholder={placeholder}
		action={action}
		onAction={action('submit')}
	/>
);

export const withPrefix = ({ placeholder, prefix, action }: Props) => (
	<TextInput
	placeholder={placeholder}
	action={action}
		onAction={action('submit')}
		prefix={prefix}
	/>
);

export const clearable = ({ placeholder, prefix, action, clearable }: Props) => (
	<TextInput
		placeholder={placeholder}
		action={action}
		onAction={action('submit')}
		prefix={prefix}
		clearable
	/>
);

export const autosize = ({ placeholder, autosize }: Props) => (
	<Portal.Host>
		<TextInput placeholder={placeholder} autosize />
	</Portal.Host>
);
