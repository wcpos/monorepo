import { memo, useEffect, useRef } from 'react';

import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { reorderWithEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/reorder-with-edge';
import { triggerPostMoveFlash } from '@atlaskit/pragmatic-drag-and-drop-flourish/trigger-post-move-flash';

import { DndContextProvider } from './context';
import { SortableItem } from './sortable-item';
import { isSortableItemData, type SortableListProps } from './types';

/**
 * A container component for creating sortable lists with drag-and-drop functionality.
 */
function SortableListInner<T>({
	listId,
	items,
	getItemId,
	renderItem,
	onOrderChange,
	gap = 0,
	axis = 'vertical',
	className = '',
	showFlash = true,
}: SortableListProps<T>) {
	// Use refs to avoid stale closures in the monitor callback
	const itemsRef = useRef(items);
	const getItemIdRef = useRef(getItemId);
	const onOrderChangeRef = useRef(onOrderChange);

	// Keep refs up to date (no state changes, just ref updates)
	itemsRef.current = items;
	getItemIdRef.current = getItemId;
	onOrderChangeRef.current = onOrderChange;

	// Compute itemIds once per render for the context
	const itemIds = items.map(getItemId);
	const itemIdsRef = useRef(itemIds);
	itemIdsRef.current = itemIds;

	useEffect(() => {
		const cleanup = monitorForElements({
			canMonitor({ source }) {
				if (!isSortableItemData(source.data)) {
					return false;
				}
				return source.data.listId === listId;
			},
			onDrop({ location, source }) {
				const target = location.current.dropTargets[0];
				if (!target) {
					return;
				}

				const sourceData = source.data;
				const targetData = target.data;

				if (!isSortableItemData(sourceData) || !isSortableItemData(targetData)) {
					return;
				}

				if (sourceData.listId !== listId || targetData.listId !== listId) {
					return;
				}

				const currentItems = itemsRef.current;
				const currentItemIds = itemIdsRef.current;
				const currentGetItemId = getItemIdRef.current;
				const currentOnOrderChange = onOrderChangeRef.current;

				const indexOfSource = currentItemIds.indexOf(sourceData.itemId);
				const indexOfTarget = currentItemIds.indexOf(targetData.itemId);

				if (indexOfTarget < 0 || indexOfSource < 0) {
					return;
				}

				if (indexOfSource === indexOfTarget) {
					return;
				}

				const closestEdgeOfTarget = extractClosestEdge(targetData);

				const reorderedItems = reorderWithEdge({
					list: currentItems,
					startIndex: indexOfSource,
					indexOfTarget,
					closestEdgeOfTarget,
					axis,
				});

				const newItemIds = reorderedItems.map(currentGetItemId);
				const newIndex = newItemIds.indexOf(sourceData.itemId);

				if (currentOnOrderChange) {
					currentOnOrderChange({
						items: reorderedItems,
						fromIndex: indexOfSource,
						toIndex: newIndex,
						itemId: sourceData.itemId,
					});
				}

				if (showFlash) {
					requestAnimationFrame(() => {
						const element = document.querySelector(`[data-sortable-id="${sourceData.itemId}"]`);
						if (element instanceof HTMLElement) {
							triggerPostMoveFlash(element);
						}
					});
				}
			},
		});

		return cleanup;
	}, [listId, axis, showFlash]);

	const flexDirection = axis === 'vertical' ? 'flex-col' : 'flex-row';

	return (
		<DndContextProvider listId={listId} gap={gap} axis={axis} itemIds={itemIds}>
			<div className={`flex ${flexDirection} ${className}`} data-sortable-list={listId}>
				{items.map((item, index) => {
					const itemId = getItemId(item);
					return (
						<SortableItem key={itemId} id={itemId}>
							{renderItem(item, index)}
						</SortableItem>
					);
				})}
			</div>
		</DndContextProvider>
	);
}

// Export memoized version to prevent unnecessary re-renders from parent
export const SortableList = memo(SortableListInner) as typeof SortableListInner;

/**
 * Utility function to reorder an array based on drag result.
 */
export function reorder<T>(list: T[], fromIndex: number, toIndex: number): T[] {
	const result = Array.from(list);
	const [removed] = result.splice(fromIndex, 1);
	result.splice(toIndex, 0, removed);
	return result;
}
