import React from 'react';
import { action } from '@storybook/addon-actions';
import Text from '../text';
import Pressable from './';

export default {
	title: 'Components/Pressable',
};

export const basicUsage = () => (
	<Pressable onPress={action('onPress')}>
		<Text>I'm pressable!</Text>
	</Pressable>
);
