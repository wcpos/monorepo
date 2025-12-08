import * as React from 'react';
import { useSharedValue, runOnJS } from 'react-native-reanimated';

import type { ItemId, ListId, ItemLayout, SortableContextValue, ReorderResult } from './types';

/**
 * Context for sortable list functionality
 */
const SortableContext = React.createContext<SortableContextValue | null>(null);

/**
 * Hook to access the sortable context
 * @throws Error if used outside of a SortableList
 */
export function useSortableContext(): SortableContextValue {
	const context = React.useContext(SortableContext);
	if (!context) {
		throw new Error('useSortableContext must be used within a SortableList');
	}
	return context;
}

/**
 * Hook to check if we're inside a sortable context (doesn't throw)
 */
export function useMaybeSortableContext(): SortableContextValue | null {
	return React.useContext(SortableContext);
}

/**
 * Props for SortableContextProvider
 */
interface SortableContextProviderProps<T> {
	children: React.ReactNode;
	listId: ListId;
	gap: number;
	axis: 'vertical' | 'horizontal';
	items: T[];
	getItemId: (item: T) => ItemId;
	onOrderChange?: (result: ReorderResult<T>) => void;
	onDragStart?: () => void;
	onDragEnd?: () => void;
}

/**
 * Internal provider component used by SortableList
 */
export function SortableContextProvider<T>({
	children,
	listId,
	gap,
	axis,
	items,
	getItemId,
	onOrderChange,
	onDragStart,
	onDragEnd,
}: SortableContextProviderProps<T>) {
	// Shared values for drag state (accessible from UI thread)
	const activeId = useSharedValue<ItemId | null>(null);
	const activeIndex = useSharedValue<number>(-1);
	const targetIndex = useSharedValue<number>(-1);

	// Store positions (index in the visual order)
	const positions = useSharedValue<Map<ItemId, number>>(new Map());

	// Store layouts (measurements)
	const layouts = useSharedValue<Map<ItemId, ItemLayout>>(new Map());

	// Keep items ref up to date
	const itemsRef = React.useRef(items);
	const getItemIdRef = React.useRef(getItemId);
	const onOrderChangeRef = React.useRef(onOrderChange);

	itemsRef.current = items;
	getItemIdRef.current = getItemId;
	onOrderChangeRef.current = onOrderChange;

	// Initialize positions when items change
	React.useEffect(() => {
		const newPositions = new Map<ItemId, number>();
		items.forEach((item, index) => {
			const id = getItemId(item);
			newPositions.set(id, index);
		});
		positions.value = newPositions;
	}, [items, getItemId, positions]);

	// Register/unregister item layouts
	const registerItem = React.useCallback(
		(id: ItemId, layout: ItemLayout) => {
			'worklet';
			const newLayouts = new Map(layouts.value);
			newLayouts.set(id, layout);
			layouts.value = newLayouts;
		},
		[layouts]
	);

	const unregisterItem = React.useCallback(
		(id: ItemId) => {
			'worklet';
			const newLayouts = new Map(layouts.value);
			newLayouts.delete(id);
			layouts.value = newLayouts;
		},
		[layouts]
	);

	// Start dragging an item
	const startDrag = React.useCallback(
		(id: ItemId, index: number) => {
			'worklet';
			activeId.value = id;
			activeIndex.value = index;
			targetIndex.value = index;
			if (onDragStart) {
				runOnJS(onDragStart)();
			}
		},
		[activeId, activeIndex, targetIndex, onDragStart]
	);

	// Update drag position and calculate target index
	const updateDrag = React.useCallback(
		(translationY: number, translationX: number) => {
			'worklet';
			if (activeId.value === null) return;

			const currentLayout = layouts.value.get(activeId.value);
			if (!currentLayout) return;

			const translation = axis === 'vertical' ? translationY : translationX;
			const itemSize = axis === 'vertical' ? currentLayout.height + gap : currentLayout.width + gap;
			const currentIndex = activeIndex.value;

			// Calculate how many positions we've moved
			const offset = Math.round(translation / itemSize);
			const newTargetIndex = Math.max(0, Math.min(currentIndex + offset, items.length - 1));

			if (newTargetIndex !== targetIndex.value) {
				targetIndex.value = newTargetIndex;
			}
		},
		[activeId, activeIndex, targetIndex, layouts, axis, gap, items.length]
	);

	// End drag and finalize order
	const endDrag = React.useCallback(() => {
		'worklet';
		const fromIndex = activeIndex.value;
		const toIndex = targetIndex.value;
		const draggedId = activeId.value;

		// Reset state
		activeId.value = null;
		activeIndex.value = -1;
		targetIndex.value = -1;

		// Call onOrderChange if order changed
		if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0 && draggedId !== null) {
			runOnJS(handleOrderChange)(fromIndex, toIndex, draggedId);
		}

		if (onDragEnd) {
			runOnJS(onDragEnd)();
		}
	}, [activeId, activeIndex, targetIndex, onDragEnd]);

	// Handle order change on JS thread
	const handleOrderChange = React.useCallback(
		(fromIndex: number, toIndex: number, itemId: ItemId) => {
			const currentItems = itemsRef.current;
			const currentOnOrderChange = onOrderChangeRef.current;

			if (!currentOnOrderChange) return;

			// Create reordered array
			const reorderedItems = [...currentItems];
			const [removed] = reorderedItems.splice(fromIndex, 1);
			reorderedItems.splice(toIndex, 0, removed);

			currentOnOrderChange({
				items: reorderedItems,
				fromIndex,
				toIndex,
				itemId,
			});
		},
		[]
	);

	const getItemCount = React.useCallback(() => items.length, [items.length]);

	// Build context value
	const value = React.useMemo<SortableContextValue>(
		() => ({
			listId,
			gap,
			axis,
			activeId,
			activeIndex,
			targetIndex,
			positions,
			layouts,
			registerItem,
			unregisterItem,
			startDrag,
			updateDrag,
			endDrag,
			getItemCount,
		}),
		[
			listId,
			gap,
			axis,
			activeId,
			activeIndex,
			targetIndex,
			positions,
			layouts,
			registerItem,
			unregisterItem,
			startDrag,
			updateDrag,
			endDrag,
			getItemCount,
		]
	);

	return <SortableContext.Provider value={value}>{children}</SortableContext.Provider>;
}
