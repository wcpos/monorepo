import * as React from 'react';

import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';

import type {
	ItemId,
	ItemLayout,
	LayoutsRecord,
	ListId,
	PositionsRecord,
	ReorderResult,
	SortableContextValue,
} from './types';

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
}: SortableContextProviderProps<T>) {
	// Shared values for drag state (accessible from UI thread)
	const activeId = useSharedValue<ItemId | null>(null);
	const activeIndex = useSharedValue<number>(-1);
	const targetIndex = useSharedValue<number>(-1);

	// Store positions (index in the visual order) - using plain objects for worklet compatibility
	const positions = useSharedValue<PositionsRecord>({});

	// Store layouts (measurements) - using plain objects for worklet compatibility
	const layouts = useSharedValue<LayoutsRecord>({});

	// Keep items ref up to date
	const itemsRef = React.useRef(items);
	const getItemIdRef = React.useRef(getItemId);
	const onOrderChangeRef = React.useRef(onOrderChange);

	itemsRef.current = items;
	getItemIdRef.current = getItemId;
	onOrderChangeRef.current = onOrderChange;

	// Initialize positions when items change - syncs item order to UI thread
	React.useEffect(() => {
		const newPositions: PositionsRecord = {};
		items.forEach((item, index) => {
			const id = getItemId(item);
			newPositions[id] = index;
		});
		// Schedule update on UI thread where gesture worklets read it
		const updatePositions = (newPos: PositionsRecord) => {
			'worklet';
			positions.value = newPos;
		};
		scheduleOnUI(updatePositions, newPositions);
	}, [items, getItemId, positions]);

	// Register item layout (called from JS thread, updates on UI thread)
	const registerItem = React.useCallback(
		(id: ItemId, layout: ItemLayout) => {
			const addLayout = (itemId: ItemId, itemLayout: ItemLayout) => {
				'worklet';
				layouts.value = { ...layouts.value, [itemId]: itemLayout };
			};
			scheduleOnUI(addLayout, id, layout);
		},
		[layouts]
	);

	// Unregister item layout (called from JS thread, updates on UI thread)
	const unregisterItem = React.useCallback(
		(id: ItemId) => {
			const removeLayout = (itemId: ItemId) => {
				'worklet';
				// Use delete instead of computed property destructuring due to minification bugs
				// with the pattern: const { [itemId]: _, ...rest } = obj
				// Note: Can't use lodash/omit in worklets, so using inline delete
				const newLayouts = { ...layouts.value };
				delete newLayouts[itemId];
				layouts.value = newLayouts;
			};
			scheduleOnUI(removeLayout, id);
		},
		[layouts]
	);

	// Handle order change on JS thread (called via scheduleOnRN from worklet)
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
			handleOrderChange,
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
			handleOrderChange,
		]
	);

	return <SortableContext.Provider value={value}>{children}</SortableContext.Provider>;
}
