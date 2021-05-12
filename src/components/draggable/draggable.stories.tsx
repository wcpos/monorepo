import * as React from 'react';
import { View, PanResponderGestureState } from 'react-native';
import { action } from '@storybook/addon-actions';
import Icon from '../icon';
import { Draggable, DraggableProps } from './draggable';

export default {
	title: 'Components/Draggable',
	component: Draggable,
};

export const BasicUsage = (props: DraggableProps) => {
	const [position, setPosition] = React.useState({ top: 0, left: 0 });

	const handleDrag = (gestureState: PanResponderGestureState) => {
		setPosition({ top: gestureState.dy, left: gestureState.dx });
	};

	return (
		<View style={{ height: 300, position: 'relative' }}>
			<Draggable {...props} onDrag={handleDrag} style={[{ position: 'absolute' }, position]}>
				<Icon name="more-vert" />
			</Draggable>
		</View>
	);
};
BasicUsage.args = {
	onDrag: action('Drag'),
	onDragRelease: action('Drag Release'),
};
