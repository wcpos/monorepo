import Animated, { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';

type UseSetInitialValueProps = {
	translateX: Animated.SharedValue<number>;
	sliderWidth: Animated.SharedValue<number>;
	min: number;
	max: number;
	initialValue: number;
};

export const useSetInitialValue = ({
	translateX,
	sliderWidth,
	min,
	max,
	initialValue,
}: UseSetInitialValueProps) => {
	const isInitialized: Animated.SharedValue<boolean> = useSharedValue(false);
	useAnimatedReaction(
		() => sliderWidth.value * ((initialValue - min) / (max - min)),
		(initialX) => {
			if (!isInitialized.value && initialX > 0) {
				isInitialized.value = true;
				translateX.value = initialX;
			}
		}
	);
};
