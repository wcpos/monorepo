import * as React from 'react';
import { action } from '@storybook/addon-actions';
import Text, { ITextProps } from './text';

export default {
	title: 'Components/Text',
};

const lorem =
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse iaculis, nulla at luctus ultrices, dolor.';

/**
 *
 */
export const basicUsage = ({ text, type, size, weight, align, uppercase, italic }: ITextProps & { text: string }) => (
	<Text
		type={type}
		size={size}
		weight={weight}
		align={align}
		uppercase={uppercase}
		italic={italic}
	>
		{text}
	</Text>
);
basicUsage.args = {
	text: lorem
}

/**
 *
 */
export const cascadingStyles = ({ text }: ITextProps & { text: string }) => (
	<Text style={{ color: 'blue', fontSize: 22 }}>
		{text}
		<Text style={{ color: 'red' }}>Nested test</Text>
	</Text>
);
basicUsage.args = {
	text: 'Test'
}

/**
 *
 */
export const links = () => <Text onPress={action('click')}>Link</Text>;
