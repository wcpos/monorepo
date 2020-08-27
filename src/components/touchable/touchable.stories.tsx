import React from 'react';
import { Text, View } from 'react-native';

import { action } from '@storybook/addon-actions';
import { text, boolean } from '@storybook/addon-knobs';

import Touchable from '.';

export default {
	title: 'Component/Touchable',
};

export const basicUsage = () => (
	<Touchable disabled={boolean('disabled', false)} onPress={action('Pressed')}>
		<Text>{text('text', 'Touch Me!')}</Text>
	</Touchable>
);

export const hover = () => (
	<Touchable
		disabled={boolean('disabled', false)}
		onMouseEnter={action('Mouse Enter')}
		onMouseLeave={action('Mouse Leave')}
	>
		<Text>{text('text', 'Hover over me!')}</Text>
	</Touchable>
);
