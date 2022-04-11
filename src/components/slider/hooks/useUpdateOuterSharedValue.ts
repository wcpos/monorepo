import Animated, { useAnimatedReaction } from 'react-native-reanimated';

export const useUpdateOuterSharedValue = (
	value: Animated.SharedValue<number>,
	sharedValue?: Animated.SharedValue<number>
) => {
	useAnimatedReaction(
		() => value.value,
		(_value, previousValue) => {
			if (sharedValue && _value !== previousValue) {
				sharedValue.value = _value;
			}
		}
	);
};
