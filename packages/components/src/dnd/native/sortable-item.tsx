import * as React from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
	useAnimatedReaction,
	runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useSortableContext } from './context';
import type { SortableItemProps, ItemLayout } from './types';

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
		layouts,
		registerItem,
		unregisterItem,
		startDrag,
		updateDrag,
		endDrag,
		getItemCount,
	} = useSortableContext();

	// Track this item's position in the current order
	const itemIndex = useSharedValue(-1);

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

	// Measure and register layout
	const handleLayout = React.useCallback(
		(event: LayoutChangeEvent) => {
			const { x, y, width, height } = event.nativeEvent.layout;
			const layout: ItemLayout = { x, y, width, height };
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

			// Find current index
			const layout = layouts.value.get(id);
			if (layout) {
				const itemSize = axis === 'vertical' ? layout.height + gap : layout.width + gap;
				const position = axis === 'vertical' ? layout.y : layout.x;
				const index = Math.round(position / itemSize);
				itemIndex.value = index;
				startDrag(id, index);
			}

			runOnJS(triggerHaptic)();
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

			// Update target position calculation
			updateDrag(event.translationY, event.translationX);
		})
		.onEnd(() => {
			'worklet';
			isDragging.value = false;

			// Calculate final position
			const from = activeIndex.value;
			const to = targetIndex.value;
			const layout = layouts.value.get(id);

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

			endDrag();
		});

	// React to other items moving (when this item is NOT being dragged)
	useAnimatedReaction(
		() => ({
			active: activeId.value,
			from: activeIndex.value,
			to: targetIndex.value,
		}),
		(current, previous) => {
			// Skip if this is the dragged item
			if (current.active === id) return;
			if (current.active === null) {
				// Reset when drag ends
				translateX.value = withSpring(0, SPRING_CONFIG);
				translateY.value = withSpring(0, SPRING_CONFIG);
				return;
			}

			// Calculate if this item needs to move
			const myIndex = itemIndex.value;
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
			const layout = layouts.value.get(id);
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

	// Animated styles
	const animatedStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: translateX.value },
			{ translateY: translateY.value },
			{ scale: scale.value },
		],
		opacity: opacity.value,
		zIndex: zIndex.value,
	}));

	return (
		<GestureDetector gesture={panGesture}>
			<Animated.View style={[style, animatedStyle]} onLayout={handleLayout}>
				{children}
			</Animated.View>
		</GestureDetector>
	);
}
