import React from 'react';
import { action } from '@storybook/addon-actions';
import { text, select, boolean } from '@storybook/addon-knobs';
import Text from './';

export default {
	title: 'Components/Text',
};

const lorem =
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse iaculis, nulla at luctus ultrices, dolor.';

/**
 *
 */
export const basicUsage = () => (
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
);

/**
 *
 */
export const cascadingStyles = () => (
	<Text style={{ color: 'blue', fontSize: 22 }}>
		Test
		<Text style={{ color: 'red' }}>Nested test</Text>
	</Text>
);

/**
 *
 */
export const links = () => <Text onPress={action('click')}>Link</Text>;
