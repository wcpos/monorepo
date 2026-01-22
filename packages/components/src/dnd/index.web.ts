/**
 * Drag and Drop Components (Web)
 *
 * A reusable component library for drag-and-drop functionality built on
 * @atlaskit/pragmatic-drag-and-drop.
 *
 * Features:
 * - SortableList: Container for sortable items with automatic reordering
 * - SortableItem: Wrapper that makes any component draggable
 * - Support for nested lists (items only reorder within their own list)
 * - onOrderChange callback for state management
 * - Visual feedback with drop indicators and post-move flash
 *
 * @example Basic Usage
 * ```tsx
 * import { SortableList } from '@wcpos/components/dnd';
 *
 * const [items, setItems] = useState([
 *   { id: '1', name: 'Item 1' },
 *   { id: '2', name: 'Item 2' },
 * ]);
 *
 * <SortableList
 *   listId="my-list"
 *   items={items}
 *   getItemId={(item) => item.id}
 *   onOrderChange={({ items }) => setItems(items)}
 *   renderItem={(item) => <div>{item.name}</div>}
 * />
 * ```
 *
 * @example Nested Lists
 * ```tsx
 * // Each nested list has its own listId
 * // Items can only be reordered within their own list
 * {parentItems.map(parent => (
 *   <SortableList
 *     listId={`children-${parent.id}`}
 *     items={parent.children}
 *     getItemId={(item) => item.id}
 *     onOrderChange={({ items }) => updateChildren(parent.id, items)}
 *     renderItem={(item) => <ChildItem item={item} />}
 *   />
 * ))}
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
	ItemId,
	ListId,
	DragState,
	ReorderResult,
	SortableListProps,
	SortableItemProps,
	SortableContextValue,
} from './types/sortable';

// =============================================================================
// Components
// =============================================================================

export { SortableList, reorder } from './web/sortable-list';
export { SortableItem, useDragHandle, DragHandle } from './web/sortable-item';
export { DropIndicator } from './web/drop-indicator';

// =============================================================================
// Hooks
// =============================================================================

export {
	useDndContext as useSortableContext,
	useMaybeDndContext as useMaybeSortableContext,
} from './web/context';
