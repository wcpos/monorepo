import * as React from 'react';
import { action } from '@storybook/addon-actions';
import Text from '../text';
import { Pressable, PressableProps } from './pressable';

export default {
	title: 'Components/Pressable',
	component: Pressable,
};

export const basicUsage = (props: PressableProps) => (
	<Pressable {...props}>
		<Text>I'm pressable!</Text>
	</Pressable>
);
basicUsage.args = {
	onLongPress: action('Long Press'),
	onPress: action('Press'),
	onHoverIn: action('Mouse In'),
	onHoverOut: action('Mouse Out'),
};
