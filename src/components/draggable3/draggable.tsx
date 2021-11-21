import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
	useAnimatedGestureHandler,
	useSharedValue,
	useDerivedValue,
	useAnimatedStyle,
	withTiming,
} from 'react-native-reanimated';
import { PanGestureHandler, PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';

const clamp = (value: number, lowerBound: number, upperBound: number) => {
	'worklet';

	return Math.min(Math.max(lowerBound, value), upperBound);
};

const round = (value: number, precision = 0) => {
	'worklet';

	const p = 10 ** precision;
	return Math.round(value * p) / p;
};

export interface DraggableProps {
	children: React.ReactNode;
	initialValue: number;
	min: number;
	max: number;
	step?: number;
	onDrag?: (value: number) => void;
	onDragStart?: () => void;
	onDragEnd?: (value: number) => void;
}

export const Draggable = ({
	children,
	initialValue = 0,
	step = 1,
	min = 0,
	max = 100,
	onDrag,
	onDragStart,
	onDragEnd,
}: DraggableProps) => {
	const translateX = useSharedValue(initialValue);
	const isActivePanGesture = useSharedValue(false);
	const sliderWidth = useSharedValue(max - min);
	const onePointWidth = useDerivedValue(() => sliderWidth.value / (max - min));

	const calculateAbsoluteValue = (x: number) => {
		'worklet';

		return round(x / onePointWidth.value / step) * step;
	};

	const value = useDerivedValue(() =>
		onePointWidth.value === 0 ? initialValue : calculateAbsoluteValue(translateX.value) + min
	);

	const panGestureHandler = useAnimatedGestureHandler<
		PanGestureHandlerGestureEvent,
		{ startX: number }
	>({
		onStart: (_, ctx) => {
			ctx.startX = translateX.value;
			if (onDragStart) {
				onDragStart();
			}
		},
		onActive: (event, ctx) => {
			isActivePanGesture.value = true;
			translateX.value = clamp(ctx.startX + event.translationX, min, max);
			if (onDrag) {
				onDrag(translateX.value);
			}
		},
		onEnd: () => {
			isActivePanGesture.value = false;
			if (onDragEnd) {
				onDragEnd(translateX.value);
			}
			// translateX.value = withTiming(calculateSnappedTranslateX(translateX.value));
		},
	});

	const translate = useAnimatedStyle(() => ({
		left: translateX.value,
	}));

	return (
		<PanGestureHandler onGestureEvent={panGestureHandler}>
			<Animated.View style={[{ position: 'absolute' }]}>{children}</Animated.View>
		</PanGestureHandler>
	);
};

export default Draggable;
