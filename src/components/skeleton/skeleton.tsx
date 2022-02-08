import * as React from 'react';
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withRepeat,
	withTiming,
	withSequence,
} from 'react-native-reanimated';
import { ViewStyle } from 'react-native';
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
	width?: number | string;
	/**
	 *
	 */
	height?: number | string;
	/**
	 *
	 */
	border?: Borders;
	/**
	 *
	 */
	style?: ViewStyle;
}

const timingConfig = {
	duration: 1600,
};

/**
 *
 */
export const Skeleton = ({ width, height, border = 'rounded', style }: SkeletonProps) => {
	const pulseColor = useSharedValue('#e1e9ee');
	const animatedBackground = useAnimatedStyle(() => ({
		backgroundColor: pulseColor.value,
	}));

	// @TODO - need to optimize this
	// React.useEffect(() => {
	// 	pulseColor.value = withRepeat(
	// 		withSequence(withTiming('#edf2f5', timingConfig), withTiming('#e1e9ee', timingConfig)),
	// 		-1
	// 	) as unknown as string; // typings are wrong for withTiming
	// }, []);

	return (
		<Styled.Container
			as={Animated.View}
			style={[{ width, height }, style, animatedBackground]}
			border={border}
		/>
	);
};
