import React from 'react';
import Button from '../button';
import Portal from '../portal';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';

import Toast from './';

const example1 = () => {
	Toast.info(
		'This is a Toast!',
		Toast.SHORT,
		() => {
			console.log('Toast closed');
		},
		false
	);
};

storiesOf('Toast', module)
	/**
	 *
	 */
	.add('basic usage', () => (
		<Portal.Host>
			<Button title="Show Toast" onPress={example1} />
		</Portal.Host>
	));
