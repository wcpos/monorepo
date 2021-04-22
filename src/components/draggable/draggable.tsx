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
	const [hovered, setHovered] = React.useState(false);

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

	return (
		// @ts-ignore
		<Pressable onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}>
			<Styled.View hovered={hovered} {...panResponder.panHandlers}>
				{children}
			</Styled.View>
		</Pressable>
	);
};
