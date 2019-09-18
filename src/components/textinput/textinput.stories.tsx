import React from 'react';
import { action } from '@storybook/addon-actions';
import { text } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react';
import TextInput from './';
import Portal from '../portal';

storiesOf('TextInput', module)
	/**
	 *
	 */
	.add('basic usage', () => <TextInput placeholder={text('placeholder', 'Placeholder text')} />)

	/**
	 *
	 */
	.add('with action', () => (
		<TextInput
			placeholder={text('placeholder', 'Placeholder text')}
			action={text('action', 'Submit')}
			onAction={action('submit')}
		/>
	))

	/**
	 *
	 */
	.add('with prefix', () => (
		<TextInput
			placeholder={text('placeholder', 'Placeholder text')}
			action={text('action', 'Submit')}
			onAction={action('submit')}
			prefix={text('prefix', 'http://')}
		/>
	))

	/**
	 *
	 */
	.add('cancellable', () => (
		<TextInput
			placeholder={text('placeholder', 'Placeholder text')}
			action={text('action', 'Submit')}
			onAction={action('submit')}
			prefix={text('prefix', 'http://')}
			cancellable={true}
		/>
	))

	/**
	 *
	 */
	.add('autosize', () => (
		<Portal.Host>
			<TextInput placeholder={text('placeholder', 'Placeholder text')} autosize={true} />
		</Portal.Host>
	));
