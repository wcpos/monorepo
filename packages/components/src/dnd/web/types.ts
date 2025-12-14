/**
 * Web-specific types and utilities for sortable lists
 *
 * Re-exports shared types from '../types/sortable'
 */

// Re-export shared types (except DragState which has web-specific additions)
export type {
	ItemId,
	ListId,
	ReorderResult,
	SortableListProps,
	SortableItemProps,
	SortableContextValue,
} from '../types/sortable';

import type { ItemId, ListId } from '../types/sortable';

/**
 * Drag state for web (includes 'preview' state for custom drag previews)
 */
export type DragState =
	| { type: 'idle' }
	| { type: 'preview'; container: HTMLElement }
	| { type: 'dragging' }
	| { type: 'dragging-over'; closestEdge: 'top' | 'bottom' | null };

/**
 * Symbol key used to identify sortable item data (web-specific)
 */
export const sortableItemKey = Symbol('sortable-item');

/**
 * Data attached to draggable items for identification (web-specific)
 */
export interface SortableItemData {
	[sortableItemKey]: true;
	itemId: ItemId;
	listId: ListId;
	index: number;
	[key: string | symbol]: unknown;
}

/**
 * Type guard to check if data is SortableItemData
 */
export function isSortableItemData(
	data: Record<string | symbol, unknown>
): data is SortableItemData {
	return data[sortableItemKey] === true;
}

/**
 * Creates the data object for a sortable item
 */
export function getSortableItemData(
	itemId: ItemId,
	listId: ListId,
	index: number
): SortableItemData {
	return {
		[sortableItemKey]: true,
		itemId,
		listId,
		index,
	};
}
