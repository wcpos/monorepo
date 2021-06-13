import * as React from 'react';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	runOnUI,
	withRepeat,
	withTiming,
	Easing,
} from 'react-native-reanimated';
import { StyleSheet, ViewStyle } from 'react-native';
import * as Styled from './styles';

/**
 *
 */
export type Borders = 'square' | 'rounded' | 'circular';

/**
 *
 */
export interface SkeletonProps {
	/**
	 *
	 */
	width: number;
	/**
	 *
	 */
	height: number;
	/**
	 *
	 */
	border?: Borders;
	/**
	 *
	 */
	style?: ViewStyle;
}

const timingConfig: Animated.WithTimingConfig = {
	duration: 1600,
	easing: Easing.bezier(0.22, 1, 0.36, 1),
};

/**
 * @TODO - translating is quite CPU intensive, perhaps a simple pulse would be better?
 */
export const Skeleton = ({ width, height, border = 'rounded', style }: SkeletonProps) => {
	const translateX = useSharedValue(-width);
	const animatedStyle = useAnimatedStyle(() => {
		return {
			transform: [
				{
					translateX: translateX.value,
				},
			],
		};
	});

	// React.useEffect(() => {
	// 	translateX.value = withRepeat(withTiming(width, timingConfig), -1);
	// 	// runOnUI(() => {
	// 	// 	'worklet';

	// 	// 	translateX.value = withRepeat(withTiming(width, timingConfig), -1);
	// 	// })();
	// }, [translateX, width]);

	return (
		<Styled.Container style={[{ width, height }, style]} border={border}>
			<Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
				<LinearGradient
					colors={['transparent', 'rgba(255, 255, 255, 0.4)', 'transparent']}
					start={{ x: 0, y: 0 }}
					end={{ x: 1, y: 0 }}
					style={StyleSheet.absoluteFill}
				/>
			</Animated.View>
		</Styled.Container>
	);
};
