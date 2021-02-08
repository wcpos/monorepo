import * as React from 'react';
import { View, PanResponder } from 'react-native';
import noop from 'lodash/noop';

type PanResponderGestureState = import('react-native').PanResponderGestureState;

interface Props {
	onStart?: (gestureState: PanResponderGestureState) => void;
	onUpdate?: (gestureState: PanResponderGestureState) => void;
	onEnd?: (gestureState: PanResponderGestureState) => void;
}

const Draggable: React.FC<Props> = ({
	onStart = noop,
	onUpdate = noop,
	onEnd = noop,
	children,
}) => {
	const panResponder = React.useRef(
		PanResponder.create({
			onMoveShouldSetPanResponder: () => true,
			// onMoveShouldSetPanResponderCapture: () => true,
			// onStartShouldSetPanResponder: () => true,
			// onStartShouldSetPanResponderCapture: () => true,
			onPanResponderGrant: (evt, gestureState) => {
				onStart(gestureState);
			},
			onPanResponderMove: (evt, gestureState) => {
				onUpdate(gestureState);
			},
			onPanResponderRelease: (evt, gestureState) => {
				onEnd(gestureState);
			},
		})
	).current;

	return <View {...panResponder.panHandlers}>{children}</View>;
};

export default Draggable;
