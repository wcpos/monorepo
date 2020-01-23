import React from 'react';

import { action } from '@storybook/addon-actions';
import { text, select, boolean } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react-native';

import Text from './';

const lorem =
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse iaculis, nulla at luctus ultrices, dolor.';

storiesOf('Text', module)
	/**
	 *
	 */
	.add('basic usage', () => (
		<Text
			type={select(
				'type',
				['primary', 'secondary', 'attention', 'info', 'success', 'warning', 'critical', 'inverse'],
				'primary'
			)}
			size={select('size', ['small', 'normal', 'large'], 'normal')}
			weight={select('weight', ['light', 'normal', 'bold'], 'normal')}
			align={select('align', ['left', 'right', 'center', 'justify'], 'left')}
			uppercase={boolean('uppercase', false)}
			italic={boolean('italic', false)}
		>
			{text('children', lorem)}
		</Text>
	))

	/**
	 *
	 */
	.add('cascading styles', () => (
		<Text style={{ color: 'blue', fontSize: 22 }}>
			Test
			<Text style={{ color: 'red' }}>Nested test</Text>
		</Text>
	))

	/**
	 *
	 */
	.add('links', () => <Text onPress={action('click')}>Link</Text>);
