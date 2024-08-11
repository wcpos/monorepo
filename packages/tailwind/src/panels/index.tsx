import * as React from 'react';
import { View, LayoutChangeEvent } from 'react-native';

import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useSharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { Icon } from '../icon';

import type { SharedValue } from 'react-native-reanimated';

type TPanelGroupContext = {
	direction: 'horizontal' | 'vertical';
	columnWidth: SharedValue<number>;
	startValue: SharedValue<number>;
	isActivePanGesture: SharedValue<boolean>;
	containerWidth: SharedValue<number>;
	onLayout: (size: { width: number }) => void;
};

const PanelGroupContext = React.createContext<TPanelGroupContext | null>(null);

PanelGroupContext.displayName = 'PanelGroupContext';

/**
 *
 */
const clamp = (value: number, lowerBound: number, upperBound: number) => {
	'worklet';

	return Math.min(Math.max(lowerBound, value), upperBound);
};

/**
 *
 */
const PanelResizeHandle = () => {
	const { columnWidth, containerWidth, onLayout, isActivePanGesture, startValue } =
		React.useContext(PanelGroupContext);

	/**
	 *
	 */
	const panGesture = React.useMemo(
		() =>
			Gesture.Pan()
				.onStart((_) => {
					isActivePanGesture.value = true;
					startValue.value = columnWidth.value;
				})
				.onUpdate((event) => {
					columnWidth.value = clamp(
						startValue.value + (event.translationX / containerWidth.value) * 100,
						20,
						80
					);
				})
				.onEnd((_) => {
					isActivePanGesture.value = false;
					runOnJS(onLayout)({ width: columnWidth.value });
				}),
		[columnWidth, containerWidth.value, isActivePanGesture, onLayout, startValue]
	);

	return (
		<GestureDetector gesture={panGesture}>
			<View>
				<Icon name="gripLines" />
			</View>
		</GestureDetector>
	);
};

PanelResizeHandle.displayName = 'PanelResizeHandle';

/**
 *
 */
const Panel = ({ children }) => {
	const { columnWidth } = React.useContext(PanelGroupContext);

	/**
	 *
	 */
	const columnStyle = useAnimatedStyle(() => {
		return { width: `${columnWidth.value}%` };
	});

	return <Animated.View style={[columnStyle]}>{children}</Animated.View>;
};

Panel.displayName = 'Panel';

/**
 *
 */
const PanelGroup = ({ children, defaultSize = 50, onLayout, direction = 'horizontal' }) => {
	const columnWidth = useSharedValue(defaultSize);
	const startValue = useSharedValue(columnWidth.value);
	const isActivePanGesture = useSharedValue(false);
	const containerWidth = useSharedValue(800);

	/**
	 *
	 */
	const onContainerLayout = React.useCallback(
		(e: LayoutChangeEvent) => {
			containerWidth.value = e.nativeEvent.layout.width;
		},
		[containerWidth]
	);

	/**
	 *
	 */
	return (
		<PanelGroupContext.Provider
			value={{
				direction,
				columnWidth,
				startValue,
				isActivePanGesture,
				containerWidth,
				onLayout,
			}}
		>
			<View
				onLayout={onContainerLayout}
				className={`flex-1 ${direction === 'horizontal' ? 'flex-row' : 'flex-col'}`}
			>
				{children}
			</View>
		</PanelGroupContext.Provider>
	);
};

PanelGroup.displayName = 'PanelGroup';

export { PanelGroup, Panel, PanelResizeHandle };
