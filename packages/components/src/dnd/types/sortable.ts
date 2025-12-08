import type { ReactNode } from 'react';

/**
 * Shared types for sortable list components (used by both web and native)
 */

/**
 * Unique identifier for items within a sortable list
 */
export type ItemId = string | number;

/**
 * Unique identifier for a sortable list (used for nested lists)
 */
export type ListId = string;

/**
 * Drag state for an item (base type - platforms may extend)
 */
export type DragState =
	| { type: 'idle' }
	| { type: 'dragging' }
	| { type: 'dragging-over'; closestEdge: 'top' | 'bottom' | 'left' | 'right' | null };

/**
 * Result of a reorder operation
 */
export interface ReorderResult<T> {
	items: T[];
	fromIndex: number;
	toIndex: number;
	itemId: ItemId;
}

/**
 * Props for the SortableList component
 */
export interface SortableListProps<T> {
	/**
	 * Unique identifier for this list. Required for nested lists to ensure
	 * items can only be reordered within their own list.
	 */
	listId: ListId;

	/**
	 * Array of items to render. Each item must have a unique id.
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
	 * Receives the new array of items in their new order.
	 */
	onOrderChange?: (result: ReorderResult<T>) => void;

	/**
	 * Gap between items in pixels (used for drop indicator positioning)
	 * @default 8
	 */
	gap?: number;

	/**
	 * Axis for drag operations
	 * @default 'vertical'
	 */
	axis?: 'vertical' | 'horizontal';

	/**
	 * Additional CSS class for the list container
	 */
	className?: string;

	/**
	 * Whether to show post-move flash animation
	 * @default true
	 */
	showFlash?: boolean;
}

/**
 * Props for the SortableItem component
 */
export interface SortableItemProps {
	/**
	 * Unique identifier for this item within its list
	 */
	id: ItemId;

	/**
	 * The content to render (your draggable component)
	 */
	children: ReactNode;

	/**
	 * Whether this item is currently disabled for dragging
	 * @default false
	 */
	disabled?: boolean;

	/**
	 * Custom drag preview render function
	 */
	renderPreview?: () => ReactNode;

	/**
	 * Additional CSS class name
	 */
	className?: string;

	/**
	 * Data attribute for querying elements (used for flash effect)
	 */
	'data-sortable-id'?: ItemId;
}

/**
 * Context value for SortableList provider
 */
export interface SortableContextValue {
	/**
	 * The ID of the list this context belongs to
	 */
	listId: ListId;

	/**
	 * Gap between items (for drop indicator)
	 */
	gap: number;

	/**
	 * Axis for drag operations
	 */
	axis: 'vertical' | 'horizontal';

	/**
	 * Register an item's element ref
	 */
	registerItem: (id: ItemId, element: HTMLElement | null) => void;

	/**
	 * Get an item's element by id
	 */
	getItemElement: (id: ItemId) => HTMLElement | null;

	/**
	 * Get the index of an item by its id
	 */
	getItemIndex: (id: ItemId) => number;
}
