import * as React from 'react';
import { action } from '@storybook/addon-actions';
import Text from '../text';
import { Pressable, PressableProps } from './pressable';

export default {
	title: 'Components/Pressable',
	component: Pressable,
};

export const basicUsage = (props: PressableProps) => (
	<Pressable {...props} onLongPress={action('Long Press')} onPress={action('Press')}>
		<Text>I'm pressable!</Text>
	</Pressable>
);
