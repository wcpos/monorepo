import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';

import type { SharedValue } from 'react-native-reanimated';
import type { ItemId, ListId, ReorderResult } from '../types/sortable';

// Re-export shared types
export type { ItemId, ListId, ReorderResult } from '../types/sortable';

/**
 * Drag state for React Native
 */
export type DragState =
	| { type: 'idle' }
	| { type: 'dragging' }
	| { type: 'dragging-over'; closestEdge: 'top' | 'bottom' | 'left' | 'right' | null };

/**
 * Layout information for an item
 */
export interface ItemLayout {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Props for the SortableList component (React Native)
 */
export interface SortableListProps<T> {
	/**
	 * Unique identifier for this list. Required for nested lists.
	 */
	listId: ListId;

	/**
	 * Array of items to render.
	 */
	items: T[];

	/**
	 * Function to get the unique identifier from an item
	 */
	getItemId: (item: T) => ItemId;

	/**
	 * Render function for each item
	 */
	renderItem: (item: T, index: number) => ReactNode;

	/**
	 * Callback fired when the order of items changes.
	 */
	onOrderChange?: (result: ReorderResult<T>) => void;

	/**
	 * Gap between items in pixels
	 * @default 8
	 */
	gap?: number;

	/**
	 * Axis for drag operations
	 * @default 'vertical'
	 */
	axis?: 'vertical' | 'horizontal';

	/**
	 * Additional style for the list container
	 */
	style?: ViewStyle;

	/**
	 * Whether to enable haptic feedback
	 * @default true
	 */
	hapticFeedback?: boolean;
}

/**
 * Props for the SortableItem component (React Native)
 */
export interface SortableItemProps {
	/**
	 * Unique identifier for this item within its list
	 */
	id: ItemId;

	/**
	 * The content to render
	 */
	children: ReactNode;

	/**
	 * Whether this item is currently disabled for dragging
	 * @default false
	 */
	disabled?: boolean;

	/**
	 * Additional style
	 */
	style?: ViewStyle;
}

/**
 * Record types for shared values (Maps don't work in Reanimated worklets)
 */
export type PositionsRecord = Record<ItemId, number>;
export type LayoutsRecord = Record<ItemId, ItemLayout>;

/**
 * Context value for the sortable list
 */
export interface SortableContextValue {
	listId: ListId;
	gap: number;
	axis: 'vertical' | 'horizontal';
	activeId: SharedValue<ItemId | null>;
	activeIndex: SharedValue<number>;
	targetIndex: SharedValue<number>;
	positions: SharedValue<PositionsRecord>;
	layouts: SharedValue<LayoutsRecord>;
	registerItem: (id: ItemId, layout: ItemLayout) => void;
	unregisterItem: (id: ItemId) => void;
	/** Called from JS thread to notify order change */
	handleOrderChange: (fromIndex: number, toIndex: number, itemId: ItemId) => void;
}
