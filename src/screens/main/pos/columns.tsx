import * as React from 'react';
import { LayoutChangeEvent, View } from 'react-native';

import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Gutter from '@wcpos/components/src/gutter';
import Suspense from '@wcpos/components/src/suspense';

import OpenOrders from './cart';
import Products from './products';
import useUI from '../contexts/ui-settings';

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
const ResizableColumns = () => {
	const { uiSettings } = useUI('pos.products');
	const columnWidth = useSharedValue(uiSettings.get('width'));
	const startValue = useSharedValue(columnWidth.value);
	const isActivePanGesture = useSharedValue(false);
	const containerWidth = useSharedValue(800);
	uiSettings.get$('width').subscribe((width) => {
		columnWidth.value = width;
	});

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
	const saveColumnWidth = React.useCallback(
		(width: number) => {
			uiSettings.incrementalPatch({ width });
		},
		[uiSettings]
	);

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
					runOnJS(saveColumnWidth)(columnWidth.value);
				}),
		[columnWidth, containerWidth.value, isActivePanGesture, saveColumnWidth, startValue]
	);

	/**
	 *
	 */
	const columnStyle = useAnimatedStyle(() => ({
		width: `${columnWidth.value}%`,
	}));

	/**
	 *
	 */
	return (
		<Box horizontal onLayout={onContainerLayout} style={{ height: '100%' }}>
			<Animated.View style={[columnStyle]}>
				<Suspense>
					<Products isColumn />
				</Suspense>
			</Animated.View>
			<GestureDetector gesture={panGesture}>
				<Gutter />
			</GestureDetector>
			<View style={{ flex: 1 }}>
				<Suspense>
					<OpenOrders isColumn />
				</Suspense>
			</View>
		</Box>
	);
};

export default ResizableColumns;
