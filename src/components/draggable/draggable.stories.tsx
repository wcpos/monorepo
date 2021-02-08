import * as React from 'react';
import { View } from 'react-native';
import { action } from '@storybook/addon-actions';
import Draggable from '.';

export default {
	title: 'Components/Draggable',
};

export const basicUsage = () => (
	<Draggable onStart={action('onStart')} onUpdate={action('onUpdate')} onEnd={action('onEnd')}>
		<View style={{ backgroundColor: '#000', width: 100, height: 100 }} />
	</Draggable>
);
