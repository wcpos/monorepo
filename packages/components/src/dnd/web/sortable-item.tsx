import * as React from 'react';

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
	type DragState,
	getSortableItemData,
	isSortableItemData,
	type SortableItemProps,
} from './types';

/**
 * Context for drag handle registration within a SortableItem
 */
interface DragHandleContextValue {
	registerDragHandle: (element: HTMLElement | null) => void;
}

const DragHandleContext = React.createContext<DragHandleContextValue | null>(null);

/**
 * State styles applied based on drag state
 */
const stateStyles: {
	[Key in DragState['type']]?: React.HTMLAttributes<HTMLDivElement>['className'];
} = {
	dragging: 'opacity-70',
};

/**
 * Base styles for sortable items with hover effects
 * Uses transparent border by default to prevent layout shift on hover
 */
const baseItemStyles =
	'bg-transparent rounded border border-transparent transition-all duration-150 hover:border-border/50 hover:shadow-sm';

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
	const ref = React.useRef<HTMLDivElement | null>(null);
	const [dragHandle, setDragHandle] = React.useState<HTMLElement | null>(null);
	const [state, setState] = React.useState<DragState>(idle);
	const { listId, gap, axis, registerItem, getItemIndex } = useDndContext();

	// Store getItemIndex in a ref to always get current index
	const getItemIndexRef = React.useRef(getItemIndex);
	getItemIndexRef.current = getItemIndex;

	// Callback for drag handle registration - uses state so effect re-runs when handle changes
	const registerDragHandle = React.useCallback((element: HTMLElement | null) => {
		setDragHandle(element);
	}, []);

	// Register this element with the context - required for drop target coordination
	React.useEffect(() => {
		registerItem(id, ref.current);
		return () => registerItem(id, null);
	}, [id, registerItem]);

	/**
	 * Setup drag and drop behavior - required to attach pragmatic-drag-and-drop to DOM.
	 *
	 * Architecture note: This effect re-runs when `dragHandle` changes (state-based).
	 * When a DragHandle component mounts inside children, it calls registerDragHandle
	 * which updates state, triggering this effect to re-initialize with the handle.
	 *
	 * The dragHandle element MUST be a DOM descendant of the draggable element for
	 * pragmatic-drag-and-drop to work correctly. If you see containment warnings,
	 * verify DragHandle is rendered inside SortableItem's children.
	 */
	React.useEffect(() => {
		const element = ref.current;
		invariant(element);

		if (disabled) {
			return;
		}

		// Validate containment - dragHandle must be inside element
		const validDragHandle =
			dragHandle && element.contains(dragHandle) ? dragHandle : undefined;

		if (dragHandle && !validDragHandle) {
			console.warn(
				'[SortableItem] DragHandle is not contained within the sortable item element. ' +
					'Ensure DragHandle is rendered as a descendant of SortableItem children.'
			);
		}

		return combine(
			draggable({
				element,
				// Use drag handle if registered and valid, otherwise entire element is draggable
				dragHandle: validDragHandle,
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
		// Re-run when dragHandle changes so draggable is re-initialized with the handle
	}, [id, listId, axis, disabled, dragHandle]);

	// Default preview renders the children
	const defaultPreview = React.useCallback(() => {
		return (
			<div className="border-border bg-card rounded border border-solid p-2 shadow-lg">
				{children}
			</div>
		);
	}, [children]);

	const PreviewContent = renderPreview ?? defaultPreview;

	// Context value for drag handle registration
	const dragHandleContextValue = { registerDragHandle };

	return (
		<DragHandleContext.Provider value={dragHandleContextValue}>
			<div className="relative m-0.5">
				<div
					data-sortable-id={id}
					ref={ref}
					className={`${baseItemStyles} ${stateStyles[state.type] ?? ''} ${className}`}
				>
					{children}
				</div>
				{state.type === 'dragging-over' && state.closestEdge ? (
					<DropIndicator edge={state.closestEdge} gap={`${gap}px`} />
				) : null}
			</div>
			{state.type === 'preview' ? createPortal(<PreviewContent />, state.container) : null}
		</DragHandleContext.Provider>
	);
}

/**
 * Hook to get drag handle props for custom drag handles.
 *
 * Returns a ref callback that registers the element as the drag handle for the
 * parent SortableItem. When the ref is attached, it triggers a state update in
 * SortableItem which re-initializes the draggable binding with the handle.
 *
 * @example
 * ```tsx
 * function MyItem() {
 *   const { dragHandleRef, dragHandleProps } = useDragHandle();
 *   return (
 *     <div>
 *       <div ref={dragHandleRef} style={dragHandleProps.style}>⋮</div>
 *       <span>Content</span>
 *     </div>
 *   );
 * }
 * ```
 */
export function useDragHandle() {
	const context = React.useContext(DragHandleContext);

	const dragHandleRef = React.useCallback(
		(element: HTMLElement | null) => {
			if (context) {
				context.registerDragHandle(element);
			}
		},
		[context]
	);

	return {
		dragHandleRef,
		dragHandleProps: {
			style: { cursor: 'grab' },
		},
	};
}

/**
 * A component that marks its children as the drag handle for a SortableItem.
 * Only dragging from this element will initiate the drag operation.
 *
 * IMPORTANT: DragHandle must be rendered as a descendant of SortableItem's children.
 * It uses React Context to register itself with the parent SortableItem.
 *
 * @example
 * ```tsx
 * <SortableList
 *   items={items}
 *   renderItem={(item) => (
 *     <div>
 *       <DragHandle className="cursor-grab">
 *         <GripIcon />
 *       </DragHandle>
 *       <span>{item.name}</span>
 *     </div>
 *   )}
 * />
 * ```
 */
export function DragHandle({
	children,
	className = '',
}: {
	children: React.ReactNode;
	className?: string;
}) {
	const { dragHandleRef, dragHandleProps } = useDragHandle();

	return (
		<div ref={dragHandleRef} className={className} style={dragHandleProps.style}>
			{children}
		</div>
	);
}
