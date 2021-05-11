import * as React from 'react';
import { PanResponder, Pressable } from 'react-native';
import noop from 'lodash/noop';
import * as Styled from './styles';

type PanResponderGestureState = import('react-native').PanResponderGestureState;

interface DraggableProps {
	children?: React.ReactNode;
	onStart?: (gestureState: PanResponderGestureState) => void;
	onUpdate?: (gestureState: PanResponderGestureState) => void;
	onEnd?: (gestureState: PanResponderGestureState) => void;
}

export const Draggable = ({
	onStart = noop,
	onUpdate = noop,
	onEnd = noop,
	children,
}: DraggableProps) => {
	const panResponder = React.useRef(
		PanResponder.create({
			// Ask to be the responder:
			onStartShouldSetPanResponder: (evt, gestureState) => true,
			onStartShouldSetPanResponderCapture: (evt, gestureState) => true,
			onMoveShouldSetPanResponder: (evt, gestureState) => true,
			onMoveShouldSetPanResponderCapture: (evt, gestureState) => true,

			onPanResponderGrant: (evt, gestureState) => {
				console.log(gestureState);
				// The gesture has started. Show visual feedback so the user knows
				// what is happening!
				// gestureState.d{x,y} will be set to zero now
			},
			onPanResponderMove: (evt, gestureState) => {
				console.log(gestureState);
				// The most recent move distance is gestureState.move{X,Y}
				// The accumulated gesture distance since becoming responder is
				// gestureState.d{x,y}
			},
			onPanResponderTerminationRequest: (evt, gestureState) => true,
			onPanResponderRelease: (evt, gestureState) => {
				console.log(gestureState);
				// The user has released all touches while this view is the
				// responder. This typically means a gesture has succeeded
			},
			onPanResponderTerminate: (evt, gestureState) => {
				// Another component has become the responder, so this gesture
				// should be cancelled
			},
			onShouldBlockNativeResponder: (evt, gestureState) => {
				// Returns whether this component should block native components from becoming the JS
				// responder. Returns true by default. Is currently only supported on android.
				return true;
			},
		})
	).current;

	// return (
	// 	<Pressable>
	// 		<Styled.View {...panResponder.panHandlers} />
	// 		{children}
	// 	</Pressable>
	// );

	return <Styled.View {...panResponder.panHandlers} />;
};
