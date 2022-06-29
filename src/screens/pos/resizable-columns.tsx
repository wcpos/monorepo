import * as React from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import { useSubscription } from 'observable-hooks';
import Animated, {
	useAnimatedGestureHandler,
	useSharedValue,
	useAnimatedStyle,
	runOnJS,
} from 'react-native-reanimated';
import { PanGestureHandler, PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import Gutter from '@wcpos/components/src/gutter';
import Box from '@wcpos/components/src/box';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';

interface ResizableColumnsProps {
	leftComponent: React.ReactNode;
	rightComponent: React.ReactNode;
	ui: import('@wcpos/hooks/src/use-ui-resource').UIDocument;
}

const clamp = (value: number, lowerBound: number, upperBound: number) => {
	'worklet';

	return Math.min(Math.max(lowerBound, value), upperBound);
};

const ResizableColumns = ({ leftComponent, rightComponent, ui }: ResizableColumnsProps) => {
	const columnWidth = useSharedValue(ui.get('width'));
	const isActivePanGesture = useSharedValue(false);
	const containerWidth = useSharedValue(800);

	useSubscription(ui.get$('width'), (width: number) => {
		columnWidth.value = width;
	});

	const onContainerLayout = React.useCallback(
		(e: LayoutChangeEvent) => {
			containerWidth.value = e.nativeEvent.layout.width;
		},
		[containerWidth]
	);

	const columnStyle = useAnimatedStyle(() => ({
		width: `${columnWidth.value}%`,
	}));

	const saveColumnWidth = React.useCallback(
		(width: number) => {
			ui.atomicPatch({ width });
			// ui.atomicUpdate((oldData) => {
			// 	oldData.width = width;
			// 	return oldData;
			// });
			// ui.update({
			// 	$set: {
			// 		width,
			// 	},
			// });
		},
		[ui]
	);

	const panGestureHandler = useAnimatedGestureHandler<
		PanGestureHandlerGestureEvent,
		{ startWidth: number }
	>({
		onStart: (_, ctx) => {
			isActivePanGesture.value = true;
			ctx.startWidth = columnWidth.value;
		},
		onActive: (event, ctx) => {
			columnWidth.value = clamp(
				ctx.startWidth + (event.translationX / containerWidth.value) * 100,
				20,
				80
			);
		},
		onEnd: () => {
			isActivePanGesture.value = false;
			runOnJS(saveColumnWidth)(columnWidth.value);
		},
	});

	useWhyDidYouUpdate('ResizableColumns', {
		leftComponent,
		rightComponent,
		ui,
		columnWidth,
		isActivePanGesture,
		containerWidth,
		onContainerLayout,
		columnStyle,
		panGestureHandler,
		saveColumnWidth,
	});

	return (
		<Box horizontal onLayout={onContainerLayout} style={{ height: '100%' }}>
			<Animated.View style={[columnStyle]}>{leftComponent}</Animated.View>
			<PanGestureHandler onGestureEvent={panGestureHandler}>
				<Animated.View style={{ width: 10 }}>
					<Gutter />
				</Animated.View>
			</PanGestureHandler>
			<View style={{ flex: 1 }}>{rightComponent}</View>
		</Box>
	);
};

export default ResizableColumns;
