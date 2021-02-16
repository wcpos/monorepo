import * as React from 'react';
import { Text, View } from 'react-native';
import { action } from '@storybook/addon-actions';
import Touchable, { ITouchableProps} from './touchable';

export default {
	title: 'Components/Touchable',
	component: Touchable
};

export const basicUsage = ({disabled, text}: ITouchableProps & { text: string }) => (
	<Touchable disabled={disabled} onPress={action('Pressed')}>
		<Text>{text}</Text>
	</Touchable>
);
basicUsage.args = {
	text: 'Touch Me!'
}

export const hover = ({disabled, text}: ITouchableProps & { text: string }) => (
	<Touchable
		disabled={disabled}
		onMouseEnter={action('Mouse Enter')}
		onMouseLeave={action('Mouse Leave')}
	>
		<Text>{text}</Text>
	</Touchable>
);
basicUsage.args = {
	text: 'Hover over me!'
}