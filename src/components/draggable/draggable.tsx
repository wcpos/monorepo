import * as React from 'react';
import { PanResponder } from 'react-native';
import noop from 'lodash/noop';
import Hoverable from '../hoverable';
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
		<Hoverable>
			{(isHovered) => (
				<Styled.View
					hovered={isHovered}
					{...panResponder.panHandlers}
					// @TODO - why does this not work in styled component
					style={[isHovered && { backgroundColor: '#f5f5f5' }]}
				>
					{children}
				</Styled.View>
			)}
		</Hoverable>
	);
};
