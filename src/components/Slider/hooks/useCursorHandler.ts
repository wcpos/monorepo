import Animated, {
	useAnimatedGestureHandler,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';
import { PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';

const clamp = (value: number, lowerBound: number, upperBound: number) => {
	'worklet';

	return Math.min(Math.max(lowerBound, value), upperBound);
};

type UseCursorHandlerProps = {
	translateX: Animated.SharedValue<number>;
	sliderWidth: Animated.SharedValue<number>;
	calculateSnappedTranslateX: (targetX: number) => number;
};

export const useCursorHandler = ({
	translateX,
	sliderWidth,
	calculateSnappedTranslateX,
}: UseCursorHandlerProps) => {
	const isActivePanGesture = useSharedValue(false);
	const panGestureHandler = useAnimatedGestureHandler<
		PanGestureHandlerGestureEvent,
		{ startX: number }
	>({
		onStart: (_, ctx) => {
			ctx.startX = translateX.value;
		},
		onActive: (event, ctx) => {
			isActivePanGesture.value = true;
			translateX.value = clamp(ctx.startX + event.translationX, 0, sliderWidth.value);
		},
		onEnd: () => {
			isActivePanGesture.value = false;
			translateX.value = withTiming(calculateSnappedTranslateX(translateX.value));
		},
	});
	return { panGestureHandler, isActivePanGesture };
};
