import React from 'react';
import { StyleSheet, View } from 'react-native';

import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

export interface UsePressOutsideProps {
	onOutsidePress: () => void;
}

export interface UsePressOutsideResult {
	PressOutsideWrapper: (props: React.ComponentProps<typeof Animated.View>) => JSX.Element;
}

export const usePressOutside = ({
	onOutsidePress,
}: UsePressOutsideProps): UsePressOutsideResult => {
	const gesture = React.useMemo(
		() =>
			Gesture.Tap()
				.maxDuration(250)
				.onStart(() => {
					console.log('hi');
					debugger;
					// onOutsidePress();
				}),
		[onOutsidePress]
	);

	const PressOutsideWrapper = ({ children, ...props }) => (
		<GestureDetector gesture={gesture}>
			{/* <Animated.View {...props} style={{ flex: 1 }}> */}
			{children}
			{/* </Animated.View> */}
		</GestureDetector>
	);

	return {
		PressOutsideWrapper,
	};
};
