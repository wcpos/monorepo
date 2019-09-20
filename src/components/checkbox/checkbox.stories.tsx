import React from 'react';
import { action } from '@storybook/addon-actions';
import { text, boolean } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react';

import Checkbox from './';

storiesOf('Checkbox', module)
	/**
	 *
	 */
	.add('basic usage', () => (
		<Checkbox
			label={text('label', 'Label')}
			checked={boolean('checked', true)}
			onChange={action('onChange')}
			hasError={boolean('hasError', false)}
			disabled={boolean('disabled', false)}
			name="test"
		/>
	))

	/**
	 *
	 */
	.add('with help', () => (
		<Checkbox
			label={text('label', 'Label')}
			info={text('info', 'Lorem ipsum dolor sit amet')}
			checked={boolean('checked', true)}
			onChange={action('onChange')}
		/>
	));
