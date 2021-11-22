import * as React from 'react';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import * as Styled from './styles';

export interface RippleProps {
	showRipple: Animated.SharedValue<boolean>;
}

export const Ripple = ({ showRipple }: RippleProps) => {
	const rippleScale = useAnimatedStyle(() => ({
		transform: [{ scale: withTiming(showRipple.value ? 1 : 0) }],
	}));

	return <Styled.RippleEffect style={rippleScale} pointerEvents="none" />;
};
