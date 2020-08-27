import React from 'react';
import { action } from '@storybook/addon-actions';
import { text } from '@storybook/addon-knobs';
import TextInput from '.';
import Portal from '../portal';

export default {
	title: 'Component/TextInput',
};

export const basicUsage = () => <TextInput placeholder={text('placeholder', 'Placeholder text')} />;

export const withAction = () => (
	<TextInput
		placeholder={text('placeholder', 'Placeholder text')}
		action={text('action', 'Submit')}
		onAction={action('submit')}
	/>
);

export const withPrefix = () => (
	<TextInput
		placeholder={text('placeholder', 'Placeholder text')}
		action={text('action', 'Submit')}
		onAction={action('submit')}
		prefix={text('prefix', 'http://')}
	/>
);

export const clearable = () => (
	<TextInput
		placeholder={text('placeholder', 'Placeholder text')}
		action={text('action', 'Submit')}
		onAction={action('submit')}
		prefix={text('prefix', 'http://')}
		cancellable
	/>
);

export const autosize = () => (
	<Portal.Host>
		<TextInput placeholder={text('placeholder', 'Placeholder text')} autosize />
	</Portal.Host>
);
