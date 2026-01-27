import * as React from 'react';
import { type LayoutChangeEvent, View, type ViewStyle } from 'react-native';

import { Gesture, GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import Animated, {
	useAnimatedReaction,
	useAnimatedStyle,
	useDerivedValue,
	useSharedValue,
	withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';

import { getLogger } from '@wcpos/utils/logger';

import { useSortableContext } from './context';

const uiLogger = getLogger(['wcpos', 'ui', 'dnd']);
import { DropIndicator } from './drop-indicator';

import type { ItemLayout, SortableItemProps } from './types';

/**
 * Context for providing the pan gesture to DragHandle components
 */
interface DragHandleContextValue {
	panGesture: PanGesture;
	setHasDragHandle: (value: boolean) => void;
}

const DragHandleContext = React.createContext<DragHandleContextValue | null>(null);

/**
 * Spring configuration for smooth animations
 */
const SPRING_CONFIG = {
	damping: 20,
	stiffness: 200,
	mass: 0.5,
};

/**
 * A wrapper component that makes its children draggable within a SortableList.
 */
export function SortableItem({ id, children, disabled = false, style }: SortableItemProps) {
	const {
		axis,
		gap,
		activeId,
		activeIndex,
		targetIndex,
		positions,
		layouts,
		registerItem,
		unregisterItem,
		handleOrderChange,
	} = useSortableContext();

	// Track if a drag handle is being used (set by DragHandle component)
	const [hasDragHandle, setHasDragHandle] = React.useState(false);

	// Animation values
	const translateX = useSharedValue(0);
	const translateY = useSharedValue(0);
	const scale = useSharedValue(1);
	const zIndex = useSharedValue(0);
	const opacity = useSharedValue(1);

	// Track if this item is currently being dragged
	const isDragging = useSharedValue(false);

	// Store initial gesture offset
	const startX = useSharedValue(0);
	const startY = useSharedValue(0);

	// Track drop indicator state
	const [indicatorEdge, setIndicatorEdge] = React.useState<'top' | 'bottom' | 'left' | 'right' | null>(null);

	// Determine if this item should show the drop indicator
	useDerivedValue(() => {
		const active = activeId.value;
		const from = activeIndex.value;
		const to = targetIndex.value;
		const myIndex = positions.value[id] ?? -1;

		// No indicator if no active drag, this is the dragged item, or indices are invalid
		if (active === null || active === id || myIndex < 0 || from < 0 || to < 0 || from === to) {
			scheduleOnRN(setIndicatorEdge, null);
			return;
		}

		// Show indicator on the item at the target position
		if (myIndex === to) {
			const edge = axis === 'vertical' ? (from < to ? 'bottom' : 'top') : from < to ? 'right' : 'left';
			scheduleOnRN(setIndicatorEdge, edge);
		} else {
			scheduleOnRN(setIndicatorEdge, null);
		}
	}, [id, axis]);

	// Measure and register layout
	const handleLayout = React.useCallback(
		(event: LayoutChangeEvent) => {
			const { x, y, width, height } = event.nativeEvent.layout;
			const layout: ItemLayout = { x, y, width, height };
			uiLogger.debug(`handleLayout for ${id}`, { context: { layout } });
			registerItem(id, layout);
		},
		[id, registerItem]
	);

	// Unregister on unmount
	React.useEffect(() => {
		return () => {
			unregisterItem(id);
		};
	}, [id, unregisterItem]);

	// Trigger haptic feedback
	const triggerHaptic = React.useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
	}, []);

	// Debug logging function (called from worklet via scheduleOnRN)
	const logDragStart = React.useCallback(
		(itemId: string, index: number, positionsSnapshot: Record<string, number>) => {
			uiLogger.debug(`Drag started for ${itemId}`, {
				context: { index, positions: positionsSnapshot },
			});
		},
		[]
	);

	const logDragUpdate = React.useCallback(
		(
			from: number,
			to: number,
			translationY: number,
			hasLayout: boolean,
			itemSize: number,
			offset: number,
			newTarget: number
		) => {
			uiLogger.debug(`Drag update`, {
				context: { from, to, translationY, hasLayout, itemSize, offset, newTarget },
			});
		},
		[]
	);

	const logDragEnd = React.useCallback((from: number, to: number) => {
		uiLogger.debug(`Drag ended`, { context: { from, to } });
	}, []);

	// Pan gesture for dragging
	const panGesture = Gesture.Pan()
		.enabled(!disabled)
		.onStart(() => {
			'worklet';
			isDragging.value = true;
			startX.value = translateX.value;
			startY.value = translateY.value;
			zIndex.value = 1000;
			scale.value = withSpring(1.02, SPRING_CONFIG);
			opacity.value = 0.9;

			// Get current index from positions
			const positionsSnapshot = positions.value;
			const index = positionsSnapshot[id] ?? -1;

			// Log for debugging
			scheduleOnRN(logDragStart, id, index, positionsSnapshot);

			// Set drag state directly on shared values (don't call context function from worklet)
			if (index >= 0) {
				activeId.value = id;
				activeIndex.value = index;
				targetIndex.value = index;
			}

			scheduleOnRN(triggerHaptic);
		})
		.onUpdate((event) => {
			'worklet';
			if (!isDragging.value) return;

			// Update translation based on axis
			if (axis === 'vertical') {
				translateY.value = startY.value + event.translationY;
			} else {
				translateX.value = startX.value + event.translationX;
			}

			// Calculate target index directly (don't call context function from worklet)
			const currentLayout = layouts.value[id];
			let calcItemSize = 0;
			let calcOffset = 0;
			let calcNewTarget = 0;

			if (currentLayout) {
				const translation = axis === 'vertical' ? event.translationY : event.translationX;
				const itemSize =
					axis === 'vertical' ? currentLayout.height + gap : currentLayout.width + gap;
				const currentIndex = activeIndex.value;
				const itemCount = Object.keys(positions.value).length;

				// Calculate how many positions we've moved
				const offset = Math.round(translation / itemSize);
				const newTargetIndex = Math.max(0, Math.min(currentIndex + offset, itemCount - 1));

				calcItemSize = itemSize;
				calcOffset = offset;
				calcNewTarget = newTargetIndex;

				if (newTargetIndex !== targetIndex.value) {
					targetIndex.value = newTargetIndex;
				}
			}

			// Log every 50px to avoid spam
			if (Math.abs(event.translationY) % 50 < 5) {
				scheduleOnRN(
					logDragUpdate,
					activeIndex.value,
					targetIndex.value,
					event.translationY,
					!!currentLayout,
					calcItemSize,
					calcOffset,
					calcNewTarget
				);
			}
		})
		.onEnd(() => {
			'worklet';
			isDragging.value = false;

			// Calculate final position
			const from = activeIndex.value;
			const to = targetIndex.value;
			const draggedId = activeId.value;

			// Log end state
			scheduleOnRN(logDragEnd, from, to);

			const layout = layouts.value[id];

			if (layout && from !== to && from >= 0 && to >= 0) {
				// Animate to new position
				const itemSize = axis === 'vertical' ? layout.height + gap : layout.width + gap;
				const offset = (to - from) * itemSize;

				if (axis === 'vertical') {
					translateY.value = withSpring(offset, SPRING_CONFIG);
				} else {
					translateX.value = withSpring(offset, SPRING_CONFIG);
				}
			} else {
				// Return to original position
				translateX.value = withSpring(0, SPRING_CONFIG);
				translateY.value = withSpring(0, SPRING_CONFIG);
			}

			// Reset visual state
			scale.value = withSpring(1, SPRING_CONFIG);
			opacity.value = 1;
			zIndex.value = 0;

			// Reset drag state
			activeId.value = null;
			activeIndex.value = -1;
			targetIndex.value = -1;

			// Call order change handler if order changed
			if (from !== to && from >= 0 && to >= 0 && draggedId !== null) {
				scheduleOnRN(handleOrderChange, from, to, draggedId);
			}
		});

	// React to other items moving (when this item is NOT being dragged)
	useAnimatedReaction(
		() => ({
			active: activeId.value,
			from: activeIndex.value,
			to: targetIndex.value,
		}),
		(current) => {
			// Skip if this is the dragged item
			if (current.active === id) return;
			if (current.active === null) {
				// Reset when drag ends
				translateX.value = withSpring(0, SPRING_CONFIG);
				translateY.value = withSpring(0, SPRING_CONFIG);
				return;
			}

			// Get this item's index from positions
			const myIndex = positions.value[id] ?? -1;
			if (myIndex < 0) return;

			const from = current.from;
			const to = current.to;

			// Determine if this item should shift
			let offset = 0;
			if (from < to) {
				// Dragging down/right: items between from and to shift up/left
				if (myIndex > from && myIndex <= to) {
					offset = -1;
				}
			} else if (from > to) {
				// Dragging up/left: items between to and from shift down/right
				if (myIndex >= to && myIndex < from) {
					offset = 1;
				}
			}

			// Apply offset animation
			const layout = layouts.value[id];
			if (layout) {
				const itemSize = axis === 'vertical' ? layout.height + gap : layout.width + gap;
				const translation = offset * itemSize;

				if (axis === 'vertical') {
					translateY.value = withSpring(translation, SPRING_CONFIG);
				} else {
					translateX.value = withSpring(translation, SPRING_CONFIG);
				}
			}
		},
		[id, axis, gap]
	);

	// Base styles for transparent background and margin
	const baseStyle: ViewStyle = {
		backgroundColor: 'transparent',
		margin: 2,
	};

	// Animated styles
	const animatedStyle = useAnimatedStyle(() => {
		return {
			transform: [
				{ translateX: translateX.value },
				{ translateY: translateY.value },
				{ scale: scale.value },
			] as ViewStyle['transform'],
			opacity: opacity.value,
			zIndex: zIndex.value,
		};
	});

	// Context value for drag handle
	const dragHandleContextValue = React.useMemo(
		() => ({ panGesture, setHasDragHandle }),
		[panGesture]
	);

	// Content to render (with or without GestureDetector)
	const content = (
		<Animated.View style={[baseStyle, style, animatedStyle]} onLayout={handleLayout}>
			{children}
		</Animated.View>
	);

	return (
		<DragHandleContext.Provider value={dragHandleContextValue}>
			<View style={{ position: 'relative' }}>
				{hasDragHandle ? content : <GestureDetector gesture={panGesture}>{content}</GestureDetector>}
				{indicatorEdge ? <DropIndicator edge={indicatorEdge} gap={gap} /> : null}
			</View>
		</DragHandleContext.Provider>
	);
}

/**
 * A component that marks its children as the drag handle for a SortableItem.
 * Only dragging from this element will initiate the drag operation.
 */
export function DragHandle({
	children,
	style,
	className,
}: {
	children: React.ReactNode;
	style?: ViewStyle;
	className?: string;
}) {
	const context = React.useContext(DragHandleContext);

	// Mark that a drag handle is being used
	React.useEffect(() => {
		if (context) {
			context.setHasDragHandle(true);
		}
		return () => {
			if (context) {
				context.setHasDragHandle(false);
			}
		};
	}, [context]);

	if (!context) {
		// If not inside a SortableItem, just render children
		return (
			<View style={style} className={className}>
				{children}
			</View>
		);
	}

	return (
		<GestureDetector gesture={context.panGesture}>
			<View style={style} className={className}>
				{children}
			</View>
		</GestureDetector>
	);
}

/**
 * Hook to get drag handle props for custom drag handles (native version).
 * On native, just returns empty props as the DragHandle component handles everything.
 */
export function useDragHandle() {
	return {
		dragHandleRef: undefined,
		dragHandleProps: {},
	};
}
