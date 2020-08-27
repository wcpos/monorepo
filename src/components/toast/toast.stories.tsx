import React from 'react';
import { action } from '@storybook/addon-actions';
import Button from '../button';
import Portal from '../portal';

import Toast from '.';

export default {
	title: 'Component/Toast',
};

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

export const basicUsage = () => (
	<Portal.Host>
		<Button title="Show Toast" onPress={example1} />
	</Portal.Host>
);
