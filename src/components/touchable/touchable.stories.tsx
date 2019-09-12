import React from 'react';
import { Text, View } from 'react-native';

import { action } from '@storybook/addon-actions';
import { text, boolean } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react';

import Touchable from './';

storiesOf('Touchable', module)
	/**
	 *
	 */
	.add('basic usage', () => (
		<Touchable disabled={boolean('disabled', false)} onPress={action('Pressed')}>
			<Text>{text('text', 'Touch Me!')}</Text>
		</Touchable>
	))

	/**
	 *
	 */
	.add('hover', () => (
		<Touchable
			disabled={boolean('disabled', false)}
			onMouseEnter={action('Mouse Enter')}
			onMouseLeave={action('Mouse Leave')}
		>
			<Text>{text('text', 'Hover over me!')}</Text>
		</Touchable>
	));
