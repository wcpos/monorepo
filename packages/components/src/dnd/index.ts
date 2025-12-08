/**
 * Drag and Drop Components (React Native)
 *
 * This module provides drag-and-drop functionality for React Native using
 * react-native-gesture-handler and react-native-reanimated v4.
 *
 * For the web implementation, see index.web.ts which uses
 * @atlaskit/pragmatic-drag-and-drop.
 */

export {
	SortableList,
	SortableListWithGestureHandler,
	SortableItem,
	useSortableContext,
	useMaybeSortableContext,
	reorder,
} from './native';

export type {
	ItemId,
	ListId,
	DragState,
	ReorderResult,
	SortableListProps,
	SortableItemProps,
	SortableContextValue,
	ItemLayout,
} from './native';

/**
 * useDragHandle - For custom drag handles
 * In React Native, the entire SortableItem is draggable by default.
 */
export function useDragHandle() {
	return { dragHandleProps: {} };
}
