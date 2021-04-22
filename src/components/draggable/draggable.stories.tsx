import * as React from 'react';
import { View } from 'react-native';
import { action } from '@storybook/addon-actions';
import Icon from '../icon';
import { Draggable } from './draggable';

export default {
	title: 'Components/Draggable',
	component: Draggable,
};

export const basicUsage = () => (
	<View style={{ height: 300 }}>
		<Draggable onStart={action('onStart')} onUpdate={action('onUpdate')} onEnd={action('onEnd')}>
			<Icon name="more-vert" />
		</Draggable>
	</View>
);
