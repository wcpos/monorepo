import React from 'react';
import Animated, { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { View } from 'react-native';
import { ColoredLine, Cursor, SliderLine } from './components';
import {
	useCalculatedValue,
	useCursorHandler,
	useSliderWidth,
	useSetInitialValue,
	useUpdateOuterSharedValue,
	useTapHandler,
} from './hooks';
import Text from '../text';
import * as Styled from './styles';

export interface SliderProps {
	min?: number;
	max: number;
	initialValue?: number;
	step?: number;
	width?: number;
	sharedValue?: Animated.SharedValue<number>;
}

export const Slider: React.FC<SliderProps> = ({
	min = 0,
	max,
	initialValue = 0,
	step = 1,
	width,
	sharedValue,
}) => {
	const translateX = useSharedValue(0);
	const { sliderWidth, onLayout } = useSliderWidth(width);
	const { value, calculateSnappedTranslateX } = useCalculatedValue({
		translateX,
		sliderWidth,
		initialValue,
		min,
		max,
		step,
	});
	const { panGestureHandler, isActivePanGesture } = useCursorHandler({
		translateX,
		sliderWidth,
		calculateSnappedTranslateX,
	});
	const { tapGestureHandler, isActiveTapGesture } = useTapHandler({
		translateX,
		sliderWidth,
		calculateSnappedTranslateX,
	});
	const showTooltip = useDerivedValue(() => isActivePanGesture.value || isActiveTapGesture.value);
	useSetInitialValue({ translateX, sliderWidth, min, max, initialValue });
	useUpdateOuterSharedValue(value, sharedValue);

	return (
		<Styled.Container>
			<View>
				<SliderLine onLayout={onLayout} tapGestureHandler={tapGestureHandler} />
				<ColoredLine translateX={translateX} />
				<Cursor
					translateX={translateX}
					value={value}
					panGestureHandler={panGestureHandler}
					showTooltip={showTooltip}
					showRipple={isActivePanGesture}
					sliderWidth={sliderWidth}
				/>
				<Styled.Row pointerEvents="none">
					<Text>{min}</Text>
					<Text>{max}</Text>
				</Styled.Row>
			</View>
		</Styled.Container>
	);
};
