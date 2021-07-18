import * as React from 'react';
import { View } from 'react-native';
import Animated, {
	useAnimatedRef,
	// measure,
	useSharedValue,
	useAnimatedStyle,
	useDerivedValue,
	withSpring,
	withTiming,
	runOnUI,
} from 'react-native-reanimated';
import useOnLayout from '@wcpos/common/src/hooks/use-on-layout';
import * as Styled from './styles';

export interface CollapsibleProps {
	/**
	 * Toggle the expanded state of the Collapsible.
	 */
	open: boolean;
	/**
	 * Content that should be collapsible.
	 */
	children: React.ReactNode;
}

/**
 * Make long sections of information available in a block that can expand or collapse.
 *
 * Should not wrap views with shadows, as shadow will be clipped.
 */
export const Collapsible = ({ open, children }: CollapsibleProps) => {
	const aref = useAnimatedRef<View>();
	const progress = useDerivedValue(() => (open ? withTiming(1) : withTiming(0)));
	const height = useSharedValue(0);

	const style = useAnimatedStyle(() => ({
		height: height.value * progress.value,
		opacity: progress.value,
	}));

	return (
		<Styled.Container as={Animated.View} style={style}>
			<View
				ref={aref}
				onLayout={({
					nativeEvent: {
						layout: { height: h },
					},
				}) => {
					height.value = h;
				}}
			>
				{children}
			</View>
		</Styled.Container>
	);
};
