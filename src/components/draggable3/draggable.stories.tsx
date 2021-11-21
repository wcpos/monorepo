import * as React from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { action } from '@storybook/addon-actions';
import Icon from '../icon';
import { Draggable, DraggableProps } from './draggable';

export default {
	title: 'Components/Draggable3',
	component: Draggable,
};

/**
 *
 */
export const BasicUsage = (props: DraggableProps) => {
	return (
		<View>
			<Draggable {...props}>
				<View style={{ width: 120, height: 120, backgroundColor: 'red' }} />
			</Draggable>
		</View>
	);
};
BasicUsage.args = {
	min: 0,
	max: 300,
	initialValue: 150,
	onDrag: action('onDrag'),
	onDragEnd: action('onDragEnd'),
	onDragStart: action('onDragStart'),
};

/**
 *
 */
export const ColumnResize = (props: DraggableProps) => {
	const columnRatio = useSharedValue(0.5);
	const columnWidth = useSharedValue(0);
	const containerWidth = useSharedValue(0);
	const isDragging = React.useRef(false);

	const columnStyle = useAnimatedStyle(() => ({
		flexBasis: `${columnRatio.value * 100}%`,
	}));

	const onContainerLayout = React.useCallback((e: LayoutChangeEvent) => {
		if (!isDragging.current) {
			containerWidth.value = e.nativeEvent.layout.width;
		}
	}, []);

	const onColumnLayout = React.useCallback((e: LayoutChangeEvent) => {
		if (!isDragging.current) {
			columnWidth.value = e.nativeEvent.layout.width;
		}
	}, []);

	const onDrag = React.useCallback(
		(value) => {
			console.log(value);
			console.log(columnWidth.value);
			console.log(containerWidth.value);
			const ratio = (columnWidth.value + value) / containerWidth.value;
			console.log(ratio);
			columnRatio.value = ratio;
		},
		[columnRatio, columnWidth.value, containerWidth.value]
	);

	return (
		<View style={{ flexDirection: 'row', flex: 1 }} onLayout={onContainerLayout}>
			<Animated.View
				style={[
					{
						flexGrow: 0,
						flexShrink: 0,
						backgroundColor: 'red',
						height: 100,
						width: 100,
					},
					columnStyle,
				]}
				onLayout={onColumnLayout}
			/>
			<View style={{ width: 20, justifyContent: 'center' }}>
				<Draggable
					min={-100}
					max={100}
					initialValue={50}
					onDrag={onDrag}
					onDragStart={() => {
						isDragging.current = true;
					}}
					onDragEnd={() => {
						isDragging.current = false;
					}}
				>
					<Icon name="more-vert" />
				</Draggable>
			</View>
			<View style={{ flex: 1, backgroundColor: 'black', height: 100 }} />
		</View>
	);
};
