import React from 'react';
import { View, PanResponder } from 'react-native';

interface Props {
	onStart?: (args) => void;
	onUpdate?: (args) => void;
	onEnd?: (args) => void;
}

const Draggable: React.FC<Props> = ({ onStart, onUpdate, onEnd, children }) => {
	const panResponder = React.useRef(
		PanResponder.create({
			onMoveShouldSetPanResponder: () => true,
			// onMoveShouldSetPanResponderCapture: () => true,
			// onStartShouldSetPanResponder: () => true,
			// onStartShouldSetPanResponderCapture: () => true,
			onPanResponderGrant: (evt, gestureState) => {
				onStart && onStart(gestureState);
			},
			onPanResponderMove: (evt, gestureState) => {
				onUpdate && onUpdate(gestureState);
			},
			onPanResponderRelease: (evt, gestureState) => {
				onEnd && onEnd(gestureState);
			},
		})
	).current;

	return <View {...panResponder.panHandlers}>{children}</View>;
};

export default Draggable;
