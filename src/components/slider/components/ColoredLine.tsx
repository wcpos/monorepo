import React from 'react';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { CURSOR_HALF_WIDTH } from '../constants';
import * as Styled from '../styles';

interface IProps {
	translateX: Animated.SharedValue<number>;
}

export const ColoredLine: React.FC<IProps> = ({ translateX }) => {
	const activeLineStyle = useAnimatedStyle(() => ({
		width: translateX.value + CURSOR_HALF_WIDTH,
	}));
	return (
		<Styled.AbsoluteView pointerEvents="none">
			<Styled.ActiveSliderLine style={activeLineStyle} />
		</Styled.AbsoluteView>
	);
};
