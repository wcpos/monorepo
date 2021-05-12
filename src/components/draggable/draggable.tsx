import * as React from 'react';
import {
	PanResponder,
	PanResponderGestureState,
	GestureResponderEvent,
	StyleProp,
	ViewStyle,
} from 'react-native';
import * as Styled from './styles';

export interface DraggableProps {
	children?: React.ReactNode;
	onDrag?: (gestureState: PanResponderGestureState) => void;
	onDragRelease?: (gestureState: PanResponderGestureState) => void;
	style: StyleProp<ViewStyle>;
}

export const Draggable = ({
	children,
	onDrag = () => {},
	onDragRelease = () => {},
	style,
}: DraggableProps) => {
	/**
	 *
	 */
	const onPanResponderMove = React.useCallback(
		(e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
			// const { dx, dy } = gestureState;
			onDrag(gestureState);
		},
		[onDrag]
	);

	/**
	 *
	 */
	const onPanResponderRelease = React.useCallback(
		(e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
			// const { dx, dy } = gestureState;
			onDragRelease(gestureState);
		},
		[onDragRelease]
	);

	/**
	 * https://reactnative.dev/docs/panresponder
	 */
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
			// The most recent move distance is gestureState.move{X,Y}
			// The accumulated gesture distance since becoming responder is
			// gestureState.d{x,y}
			onPanResponderMove,
			onPanResponderTerminationRequest: (evt, gestureState) => true,
			// The user has released all touches while this view is the
			// responder. This typically means a gesture has succeeded
			onPanResponderRelease,
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

	return (
		// @ts-ignore
		<Styled.View pointerEvents="box-none" {...panResponder.panHandlers} style={style}>
			{children}
		</Styled.View>
	);
};
