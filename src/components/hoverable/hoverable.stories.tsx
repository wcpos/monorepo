import * as React from 'react';
import { Text } from 'react-native';
import { action } from '@storybook/addon-actions';
import { Hoverable } from './hoverable';

export default {
	title: 'Components/Hoverable',
	component: Hoverable,
};

export const basicUsage = () => (
	<Hoverable>
		{(isHovered) => (
			<Text
				accessibilityRole="link"
				href="#"
				style={[isHovered && { textDecorationLine: 'underline' }]}
			>
				Click me
			</Text>
		)}
	</Hoverable>
);
