import React from 'react';
import { PanGestureHandlerGestureEvent, PanGestureHandler } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Tooltip } from './Tooltip';
import { CURSOR_HALF_WIDTH } from '../constants';
import * as Styled from '../styles';

interface IProps {
	translateX: Animated.SharedValue<number>;
	value: Animated.SharedValue<number>;
	panGestureHandler: (event: PanGestureHandlerGestureEvent) => void;
	showTooltip: Animated.SharedValue<boolean>;
	showRipple: Animated.SharedValue<boolean>;
	sliderWidth: Animated.SharedValue<number>;
}

export const Cursor: React.FC<IProps> = ({
	translateX,
	value,
	panGestureHandler,
	showTooltip,
	showRipple,
	sliderWidth,
}) => {
	const cursorLeft = useAnimatedStyle(() => ({
		left: translateX.value - CURSOR_HALF_WIDTH,
	}));
	const rippleScale = useAnimatedStyle(() => ({
		transform: [{ scale: withTiming(showRipple.value ? 1 : 0) }],
	}));

	return (
		<>
			<PanGestureHandler onGestureEvent={panGestureHandler}>
				<Styled.CursorContainer style={cursorLeft}>
					<Styled.CursorElement />
					<Styled.RippleEffect style={rippleScale} pointerEvents="none" />
				</Styled.CursorContainer>
			</PanGestureHandler>
			<Tooltip
				value={value}
				translateX={translateX}
				showTooltip={showTooltip}
				sliderWidth={sliderWidth}
			/>
		</>
	);
};
