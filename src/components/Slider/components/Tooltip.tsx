import React from 'react';
import Animated, { useAnimatedProps, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import ReText from './ReText';
import * as Styled from '../styles';

export const clamp = (value: number, lowerBound: number, upperBound: number) => {
	'worklet';

	return Math.min(Math.max(lowerBound, value), upperBound);
};

const Colors = {
	TRANSPARENT: '#0000',
	WHITE: '#FFF',
	WHITE_40: '#FFF4',
	GREEN: 'green',
	GREY: '#96959B',
	GREY2: '#F1F3F5',
	PRIMARY: '#A6D9AF',
	PRIMARY_LIGHT: '#25B53F',
	TOOLTIP_BLACK: '#1C1C1C',
};

interface IProps {
	translateX: Animated.SharedValue<number>;
	value: Animated.SharedValue<number>;
	showTooltip: Animated.SharedValue<boolean>;
	sliderWidth: Animated.SharedValue<number>;
}

export const Tooltip: React.FC<IProps> = ({ translateX, value, showTooltip, sliderWidth }) => {
	const tooltipOpacity = useAnimatedStyle(() => ({
		opacity: withTiming(showTooltip.value ? 1 : 0),
	}));
	const tooltipCloudLeft = useAnimatedStyle(() => ({
		left: clamp(translateX.value - 22, -5, sliderWidth.value - 39),
	}));
	const tooltipTriangleLeft = useAnimatedStyle(() => ({
		left: translateX.value + 3,
	}));
	// const animatedProps = useAnimatedProps(() => ({
	// 	text: String(value.value),
	// }));
	return (
		<Styled.AbsoluteView style={tooltipOpacity} pointerEvents="none">
			<Styled.TooltipCloud style={tooltipCloudLeft}>
				{/* <ReText text={value} /> */}
			</Styled.TooltipCloud>
			<Styled.TooltipTriangle style={tooltipTriangleLeft} />
		</Styled.AbsoluteView>
	);
};
