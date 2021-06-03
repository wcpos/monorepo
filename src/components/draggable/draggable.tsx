import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
	useAnimatedGestureHandler,
	useSharedValue,
	useAnimatedStyle,
	withSpring,
} from 'react-native-reanimated';
import { PanGestureHandler, PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';

const clamp = (value: number, lowerBound: number, upperBound: number) => {
	'worklet';

	return Math.min(Math.max(lowerBound, value), upperBound);
};

export interface DraggableProps {
	children: React.ReactNode;
	/**
	 *
	 */
	onStart?: (event: PanGestureHandlerGestureEvent, ctx: Record<string, unknown>) => void;
	/**
	 *
	 */
	onActive?: (event: PanGestureHandlerGestureEvent, ctx: Record<string, unknown>) => void;
	/**
	 *
	 */
	onEnd?: (event: PanGestureHandlerGestureEvent, ctx: Record<string, unknown>) => void;
	minX?: number;
	minY?: number;
	maxX?: number;
	maxY?: number;
}

export const Draggable = ({
	children,
	onStart,
	onActive,
	onEnd,
	minX,
	minY,
	maxX,
	maxY,
}: DraggableProps) => {
	const onGestureEvent = useAnimatedGestureHandler<
		PanGestureHandlerGestureEvent,
		{ x: number; y: number }
	>({
		onStart(event, ctx) {
			if (onStart) {
				// @ts-ignore
				onStart(event, ctx);
			}
		},
		onActive(event, ctx) {
			if (onActive) {
				// @ts-ignore
				onActive(event, ctx);
			}
		},
		onEnd(event, ctx) {
			if (onEnd) {
				// @ts-ignore
				onEnd(event, ctx);
			}
		},
	});

	return <PanGestureHandler onGestureEvent={onGestureEvent}>{children}</PanGestureHandler>;
};

export default Draggable;
