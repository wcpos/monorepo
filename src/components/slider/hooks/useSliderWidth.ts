import { LayoutChangeEvent } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { CURSOR_WIDTH } from '../constants';

export const useSliderWidth = (width: number = CURSOR_WIDTH) => {
	const sliderWidth = useSharedValue(width - CURSOR_WIDTH);
	const onLayout = (e: LayoutChangeEvent) => {
		'worklet';

		sliderWidth.value = e.nativeEvent.layout.width - CURSOR_WIDTH;
	};
	return { sliderWidth, onLayout };
};
