import React from 'react';
import { Text, View } from 'react-native';

import { text, boolean } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react';

import Touchable from './';

storiesOf('Touchable', module)
	/**
	 *
	 */
	.add('basic usage', () => (
		<Touchable disabled={boolean('disabled', false)}>
			<View style={{ backgroundColor: 'blue' }}>
				<Text>{text('text', 'Touch Me!')}</Text>
			</View>
		</Touchable>
	));
