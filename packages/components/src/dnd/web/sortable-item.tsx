import {
	type HTMLAttributes,
	type ReactNode,
	useEffect,
	useRef,
	useState,
	useCallback,
} from 'react';
import { createPortal } from 'react-dom';

import {
	draggable,
	dropTargetForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview';
import {
	attachClosestEdge,
	extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import invariant from 'tiny-invariant';

import { useDndContext } from './context';
import { DropIndicator } from './drop-indicator';
import {
	getSortableItemData,
	isSortableItemData,
	type DragState,
	type SortableItemProps,
} from './types';

/**
 * State styles applied based on drag state
 */
const stateStyles: { [Key in DragState['type']]?: HTMLAttributes<HTMLDivElement>['className'] } = {
	dragging: 'opacity-40',
};

const idle: DragState = { type: 'idle' };

/**
 * A wrapper component that makes its children draggable within a SortableList.
 */
export function SortableItem({
	id,
	children,
	disabled = false,
	renderPreview,
	className = '',
}: SortableItemProps) {
	const ref = useRef<HTMLDivElement | null>(null);
	const [state, setState] = useState<DragState>(idle);
	const { listId, gap, axis, registerItem, getItemIndex } = useDndContext();

	// Store getItemIndex in a ref to always get current index
	const getItemIndexRef = useRef(getItemIndex);
	getItemIndexRef.current = getItemIndex;

	// Register this element with the context
	useEffect(() => {
		registerItem(id, ref.current);
		return () => registerItem(id, null);
	}, [id, registerItem]);

	useEffect(() => {
		const element = ref.current;
		invariant(element);

		if (disabled) {
			return;
		}

		return combine(
			draggable({
				element,
				getInitialData() {
					// Get fresh index when drag starts
					const index = getItemIndexRef.current(id);
					return getSortableItemData(id, listId, index);
				},
				onGenerateDragPreview({ nativeSetDragImage }) {
					setCustomNativeDragPreview({
						nativeSetDragImage,
						getOffset: pointerOutsideOfPreview({
							x: '16px',
							y: '8px',
						}),
						render({ container }) {
							setState({ type: 'preview', container });
						},
					});
				},
				onDragStart() {
					setState({ type: 'dragging' });
				},
				onDrop() {
					setState(idle);
				},
			}),
			dropTargetForElements({
				element,
				canDrop({ source }) {
					// Don't allow dropping on yourself
					if (source.element === element) {
						return false;
					}

					// Only allow items from the same list to be dropped
					if (!isSortableItemData(source.data)) {
						return false;
					}

					// Key for nested lists: only accept drops from the same list
					return source.data.listId === listId;
				},
				getData({ input }) {
					// Get fresh index when drop target data is requested
					const index = getItemIndexRef.current(id);
					const data = getSortableItemData(id, listId, index);
					return attachClosestEdge(data, {
						element,
						input,
						allowedEdges: axis === 'vertical' ? ['top', 'bottom'] : ['left', 'right'],
					});
				},
				getIsSticky() {
					return true;
				},
				onDragEnter({ self }) {
					const closestEdge = extractClosestEdge(self.data) as 'top' | 'bottom' | null;
					setState({ type: 'dragging-over', closestEdge });
				},
				onDrag({ self }) {
					const closestEdge = extractClosestEdge(self.data) as 'top' | 'bottom' | null;

					// Only update state if something has changed to prevent re-renders
					setState((current) => {
						if (current.type === 'dragging-over' && current.closestEdge === closestEdge) {
							return current;
						}
						return { type: 'dragging-over', closestEdge };
					});
				},
				onDragLeave() {
					setState(idle);
				},
				onDrop() {
					setState(idle);
				},
			})
		);
		// Only depend on id, listId, axis, disabled - use ref for getItemIndex
	}, [id, listId, axis, disabled]);

	// Default preview renders the children
	const defaultPreview = useCallback(() => {
		return (
			<div className="rounded border border-solid bg-white p-2 shadow-lg">
				{children}
			</div>
		);
	}, [children]);

	const PreviewContent = renderPreview ?? defaultPreview;

	return (
		<>
			<div className="relative">
				<div
					data-sortable-id={id}
					ref={ref}
					className={`${stateStyles[state.type] ?? ''} ${className}`}
				>
					{children}
				</div>
				{state.type === 'dragging-over' && state.closestEdge ? (
					<DropIndicator edge={state.closestEdge} gap={`${gap}px`} />
				) : null}
			</div>
			{state.type === 'preview'
				? createPortal(<PreviewContent />, state.container)
				: null}
		</>
	);
}

/**
 * Hook to get drag handle props for custom drag handles.
 */
export function useDragHandle() {
	return {
		dragHandleProps: {
			style: { cursor: 'grab' },
		},
	};
}
