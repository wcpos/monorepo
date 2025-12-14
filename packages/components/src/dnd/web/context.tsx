import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef } from 'react';

import type { ItemId, ListId, SortableContextValue } from './types';

/**
 * Context for sortable list functionality
 */
const SortableContext = createContext<SortableContextValue | null>(null);

/**
 * Hook to access the sortable context
 * @throws Error if used outside of a SortableList
 */
export function useDndContext(): SortableContextValue {
	const context = useContext(SortableContext);
	if (!context) {
		throw new Error('useSortableContext must be used within a SortableList');
	}
	return context;
}

/**
 * Hook to check if we're inside a sortable context (doesn't throw)
 */
export function useMaybeDndContext(): SortableContextValue | null {
	return useContext(SortableContext);
}

/**
 * Props for SortableContextProvider
 */
interface SortableContextProviderProps {
	children: ReactNode;
	listId: ListId;
	gap: number;
	axis: 'vertical' | 'horizontal';
	itemIds: ItemId[];
}

/**
 * Internal provider component used by SortableList
 *
 * IMPORTANT: We use refs for mutable data and stable callbacks to prevent
 * unnecessary re-renders of children when items change.
 */
export function DndContextProvider({
	children,
	listId,
	gap,
	axis,
	itemIds,
}: SortableContextProviderProps) {
	// Map to store element refs
	const elementMapRef = useRef<Map<ItemId, HTMLElement>>(new Map());

	// Store itemIds in a ref so getItemIndex callback stays stable
	const itemIdsRef = useRef(itemIds);
	itemIdsRef.current = itemIds;

	// These callbacks use refs internally so they never need to be recreated
	const registerItem = useCallback((id: ItemId, element: HTMLElement | null) => {
		if (element) {
			elementMapRef.current.set(id, element);
		} else {
			elementMapRef.current.delete(id);
		}
	}, []);

	const getItemElement = useCallback((id: ItemId) => {
		return elementMapRef.current.get(id) ?? null;
	}, []);

	const getItemIndex = useCallback((id: ItemId) => {
		return itemIdsRef.current.indexOf(id);
	}, []); // No dependencies - reads from ref

	// Context value is stable - only changes if listId, gap, or axis change
	const value = useMemo<SortableContextValue>(
		() => ({
			listId,
			gap,
			axis,
			registerItem,
			getItemElement,
			getItemIndex,
		}),
		[listId, gap, axis, registerItem, getItemElement, getItemIndex]
	);

	return <SortableContext.Provider value={value}>{children}</SortableContext.Provider>;
}
