import React from 'react';
import { action } from '@storybook/addon-actions';
import { text, boolean } from '@storybook/addon-knobs';
import Checkbox from '.';

export default {
	title: 'Components/Checkbox',
};

export const basicUsage = () => (
	<Checkbox
		label={text('label', 'Label')}
		checked={boolean('checked', true)}
		onChange={action('onChange')}
		hasError={boolean('hasError', false)}
		disabled={boolean('disabled', false)}
		name="test"
	/>
);

export const withInfo = () => (
	<Checkbox
		label={text('label', 'Label')}
		info={text('info', 'Lorem ipsum dolor sit amet')}
		checked={boolean('checked', true)}
		onChange={action('onChange')}
	/>
);
