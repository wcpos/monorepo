import * as React from 'react';
import { View, LayoutChangeEvent } from 'react-native';

import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useSharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { Icon } from '../icon';
import { cn } from '../lib/utils';

import type { SharedValue } from 'react-native-reanimated';

type TPanelGroupContext = {
	direction: 'horizontal' | 'vertical';
	columnWidth: SharedValue<number>;
	rowHeight: SharedValue<number>;
	startValue: SharedValue<number>;
	isActivePanGesture: SharedValue<boolean>;
	containerWidth: SharedValue<number>;
	containerHeight: SharedValue<number>;
	onLayout: (size: { width: number }) => void;
};

const PanelGroupContext = React.createContext<TPanelGroupContext>(null);

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
	const {
		columnWidth,
		rowHeight,
		containerWidth,
		containerHeight,
		onResize,
		isActivePanGesture,
		startValue,
		direction,
	} = React.useContext(PanelGroupContext);

	/**
	 *
	 */
	const panGesture = React.useMemo(
		() =>
			Gesture.Pan()
				.onStart((_) => {
					isActivePanGesture.value = true;
					if (direction === 'horizontal') {
						startValue.value = columnWidth.value;
					} else {
						startValue.value = rowHeight.value;
					}
				})
				.onUpdate((event) => {
					if (direction === 'horizontal') {
						columnWidth.value = clamp(
							startValue.value + (event.translationX / containerWidth.value) * 100,
							20,
							80
						);
					} else {
						rowHeight.value = clamp(
							startValue.value + (event.translationY / containerHeight.value) * 100,
							20,
							80
						);
					}
				})
				.onEnd((_) => {
					isActivePanGesture.value = false;
					const style =
						direction === 'horizontal' ? { width: columnWidth.value } : { height: rowHeight.value };
					runOnJS(onResize)(style);
				}),
		[
			columnWidth,
			containerHeight.value,
			containerWidth.value,
			direction,
			isActivePanGesture,
			onResize,
			rowHeight,
			startValue,
		]
	);

	return (
		<GestureDetector gesture={panGesture}>
			<View
				className={cn(
					direction === 'horizontal'
						? 'w-2 cursor-ew-resize flex-row'
						: 'h-2 cursor-ns-resize flex-col',
					'group relative z-20 items-center justify-center'
				)}
			>
				<View
					className={cn(
						direction === 'horizontal'
							? 'absolute bottom-0 top-0 w-px bg-gray-200'
							: 'absolute left-0 right-0 h-px bg-gray-200',
						'opacity-0 group-hover:opacity-100'
					)}
				/>
				<View
					className={cn(
						'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform',
						'z-20 p-1 opacity-20 group-hover:rounded-md group-hover:border group-hover:border-border group-hover:bg-popover group-hover:opacity-100 group-hover:shadow-md group-hover:shadow-foreground/5',
						'transition-opacity duration-200 ease-out',
						'group-hover:animate-fadeIn group-hover:scale-95'
					)}
				>
					<Icon
						name={direction === 'horizontal' ? 'gripLinesVertical' : 'gripLines'}
						className={direction === 'horizontal' ? '-mx-0.5' : '-my-0.5'}
					/>
				</View>
			</View>
		</GestureDetector>
	);
};

PanelResizeHandle.displayName = 'PanelResizeHandle';

/**
 *
 */
const Panel = ({ children, index, defaultSize = 50 }) => {
	const { columnWidth, rowHeight, direction } = React.useContext(PanelGroupContext);

	/**
	 * Initialize columnWidth.value or rowHeight.value if they're null
	 */
	React.useEffect(() => {
		if (index === 0) {
			if (direction === 'horizontal' && columnWidth.value == null) {
				columnWidth.value = defaultSize;
			} else if (direction === 'vertical' && rowHeight.value == null) {
				rowHeight.value = defaultSize;
			}
		}
	}, [columnWidth, rowHeight, defaultSize, direction, index]);

	/**
	 * Animated style for the panel
	 */
	const animatedStyle = useAnimatedStyle(() => {
		if (direction === 'horizontal') {
			return { width: columnWidth.value ? `${columnWidth.value}%` : `${defaultSize}%` };
		} else {
			return { height: rowHeight.value ? `${rowHeight.value}%` : `${defaultSize}%` };
		}
	});

	const panelStyle = index === 0 ? animatedStyle : { flex: 1 };

	return <Animated.View style={[panelStyle]}>{children}</Animated.View>;
};

Panel.displayName = 'Panel';

/**
 *
 */
const PanelGroup = ({ children, onResize, direction = 'horizontal' }) => {
	const columnWidth = useSharedValue(null);
	const rowHeight = useSharedValue(null);
	const startValue = useSharedValue(columnWidth.value);
	const isActivePanGesture = useSharedValue(false);
	const containerWidth = useSharedValue(800);
	const containerHeight = useSharedValue(600);

	/**
	 *
	 */
	const onContainerLayout = React.useCallback(
		(e: LayoutChangeEvent) => {
			containerWidth.value = e.nativeEvent.layout.width;
			containerHeight.value = e.nativeEvent.layout.height;
		},
		[containerHeight, containerWidth]
	);

	/**
	 *
	 */
	return (
		<PanelGroupContext.Provider
			value={{
				direction,
				columnWidth,
				rowHeight,
				startValue,
				isActivePanGesture,
				containerWidth,
				containerHeight,
				onResize,
			}}
		>
			<View
				onLayout={onContainerLayout}
				className={`flex-1 ${direction === 'horizontal' ? 'flex-row' : 'flex-col'}`}
			>
				{React.Children.map(children, (child, index) =>
					React.cloneElement(child as React.ReactElement, { index })
				)}
			</View>
		</PanelGroupContext.Provider>
	);
};

PanelGroup.displayName = 'PanelGroup';

export { PanelGroup, Panel, PanelResizeHandle };
