import * as React from 'react';
import { View } from 'react-native';
import { action } from '@storybook/addon-actions';
import Icon from '../icon';
import { Draggable, DraggableProps } from './draggable';

export default {
	title: 'Components/Draggable2',
	component: Draggable,
};

export const BasicUsage = (props: DraggableProps) => (
	<View style={{ height: 300 }}>
		<Draggable {...props}>
			<Icon name="more-vert" />
		</Draggable>
	</View>
);
BasicUsage.args = {
	onDrag: action('Drag'),
	onShortPressRelease: action('Short Press Release'),
	onDragRelease: action('Drag Release'),
	onLongPress: action('Long Press'),
	onPressIn: action('Press In'),
	onPressOut: action('Press Out'),
	onRelease: action('Release'),
};
