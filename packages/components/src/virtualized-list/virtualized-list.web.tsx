import * as React from 'react';
import { View } from 'react-native';

import { useVirtualizer } from '@tanstack/react-virtual';

import { ItemContext, RootContext, useItemContext, useRootContext } from './utils/contexts';
import { useOnEndReached } from './utils/use-on-end-reached';

import type { ItemContext as BaseItemContext, ItemProps, ListProps, RootProps } from './types';

/**
 * VirtualizedList - Web Implementation
 *
 * ## Sizing Behavior
 *
 * The List component automatically sets the Root's height based on actual content size.
 * This enables proper sizing in containers that size-to-content (like Popovers).
 *
 * ### When to use className="flex-1" on Root:
 * - Parent has EXPLICIT height (e.g., a card with h-[500px] or a flex container with defined size)
 * - You want the list to fill available space and scroll within that constraint
 *
 * ### When NOT to use className="flex-1":
 * - Parent sizes to content (e.g., PopoverContent, modals without explicit height)
 * - You want the container to grow based on list content (up to parent's max-height)
 *
 * ### Why this matters:
 * - `flex: 1 1 0%` (from flex-1) sets flex-basis: 0, meaning "start at zero height"
 * - In a size-to-content parent, this causes the list to collapse
 * - Without flex-1, the List's useLayoutEffect sets explicit height based on content
 *
 * @example
 * // In a Popover (sizes to content) - NO flex-1
 * <VirtualizedList.Root>
 *   <VirtualizedList.List data={items} ... />
 * </VirtualizedList.Root>
 *
 * @example
 * // In a Card with explicit height - USE flex-1
 * <Card className="h-[400px]">
 *   <VirtualizedList.Root className="flex-1">
 *     <VirtualizedList.List data={items} ... />
 *   </VirtualizedList.Root>
 * </Card>
 */

// Web-specific extended context that includes virtualizer data
interface WebItemContext<T> extends BaseItemContext<T> {
	rowVirtualizer: any;
	vItem: any;
	horizontal: boolean;
}

/**
 * React Compiler breaks @tanstack/react-virtual
 * https://github.com/TanStack/virtual/issues/736
 */
function useVirtualWrapper(...args) {
	'use no memo';
	return { ...useVirtualizer(...args) };
}

/**
 * Root - The scroll container for virtualized content.
 * Height is automatically set by List based on content size.
 */
function Root({ style, horizontal = false, ...props }: RootProps) {
	const parentRef = React.useRef<HTMLDivElement>(null);
	const [scrollElement, setScrollElement] = React.useState<HTMLDivElement | null>(null);

	// Ref callback to set scrollElement - avoids useEffect
	const setRef = React.useCallback((node: HTMLDivElement | null) => {
		parentRef.current = node;
		if (node) {
			setScrollElement(node);
		}
	}, []);

	const value = React.useMemo(
		() => ({
			ref: parentRef,
			scrollElement,
			horizontal,
		}),
		[horizontal, scrollElement]
	);

	return (
		<RootContext.Provider value={value}>
			<View
				{...props}
				ref={setRef}
				style={[
					{
						overflow: 'auto',
						display: 'block',
						overflowX: horizontal ? 'auto' : 'hidden',
						overflowY: horizontal ? 'hidden' : 'auto',
					},
					style,
				]}
			/>
		</RootContext.Provider>
	);
}

function List<T>({
	ref,
	data,
	renderItem,
	ListEmptyComponent = null,
	parentComponent: Parent = View as any,
	parentProps,
	estimatedItemSize,
	overscan = 4,
	keyExtractor,
	onEndReached,
	onEndReachedThreshold = 0.5,
	extraData,
	getItemType,
	ListFooterComponent,
	...rest
}: ListProps<T>) {
	// extraData is used to force re-renders - we include it in a key or dependency
	// to ensure items re-render when it changes
	const extraDataKey = React.useMemo(() => JSON.stringify(extraData), [extraData]);
	const { ref: rootRef, scrollElement, horizontal } = useRootContext();

	// set up virtualizer
	const rowVirtualizer = useVirtualWrapper({
		count: data.length,
		getScrollElement: () => scrollElement,
		horizontal,
		overscan,
		estimateSize: () => estimatedItemSize,
		...rest,
	});

	// Set Root's height based on actual content size
	// useLayoutEffect ensures this happens before paint to avoid flash
	const totalSize = rowVirtualizer.getTotalSize();
	React.useLayoutEffect(() => {
		if (rootRef.current && totalSize > 0) {
			// Add parentProps padding to totalSize
			const paddingStyle = (parentProps as any)?.style;
			const padding = paddingStyle?.padding ?? 0;
			const paddingVertical = padding * 2;
			rootRef.current.style.height = `${totalSize + paddingVertical}px`;
		}
	}, [totalSize, rootRef, parentProps]);


	// expose imperative methods
	React.useImperativeHandle(
		ref,
		() => ({
			scrollToIndex: ({ index, align = 'start', animated = true }) =>
				rowVirtualizer.scrollToIndex(index, { align, behavior: animated ? 'smooth' : 'auto' }),
			scrollToOffset: (offset: number, animated = true) =>
				rowVirtualizer.scrollToOffset(offset, { behavior: animated ? 'smooth' : 'auto' }),
		}),
		[rowVirtualizer]
	);

	// Handle onEndReached logic
	useOnEndReached({
		scrollElement,
		horizontal,
		onEndReached,
		onEndReachedThreshold,
		data,
		getTotalSize: () => rowVirtualizer.getTotalSize(),
	});

	// empty state
	if (data.length === 0) {
		if (!ListEmptyComponent) {
			return <Parent {...parentProps} />;
		}

		return (
			<Parent {...parentProps}>
				{React.isValidElement(ListEmptyComponent) ? ListEmptyComponent : <ListEmptyComponent />}
			</Parent>
		);
	}

	// container style for virtualization
	const containerStyle: React.CSSProperties = {
		position: 'relative',
		height: horizontal ? '100%' : `${rowVirtualizer.getTotalSize()}px`,
		width: horizontal ? `${rowVirtualizer.getTotalSize()}px` : '100%',
		display: 'block',
	};

	const wrapperProps = {
		style: { ...containerStyle, ...((parentProps as any)?.style || {}) },
		...parentProps,
	} as React.ComponentProps<typeof Parent>;

	return (
		<Parent {...wrapperProps}>
			{rowVirtualizer.getVirtualItems().map((vItem) => {
				const item = data[vItem.index];
				// Include extraDataKey in the key to force re-render when extraData changes
				const baseKey = keyExtractor ? keyExtractor(item, vItem.index) : String(vItem.key);
				const key = extraDataKey ? `${baseKey}-${extraDataKey}` : baseKey;

				return (
					<ItemContext.Provider
						key={key}
						value={{ item, index: vItem.index, rowVirtualizer, vItem } as WebItemContext<T>}
					>
						{renderItem({ item, index: vItem.index, target: 'Cell' })}
					</ItemContext.Provider>
				);
			})}
			{ListFooterComponent && (
				<View
					style={{
						position: 'absolute',
						top: 0,
						left: 0,
						width: '100%',
						transform: `translateY(${totalSize}px)`,
					}}
				>
					{React.isValidElement(ListFooterComponent) ? (
						ListFooterComponent
					) : (
						<ListFooterComponent />
					)}
				</View>
			)}
		</Parent>
	);
}

function Item({ children, ...props }: ItemProps<any>) {
	const { index, rowVirtualizer, vItem } = useItemContext() as BaseItemContext<any>;
	const { horizontal } = useRootContext();

	return (
		<View
			dataSet={{ index: String(index) }}
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				width: '100%',
				transform: horizontal ? undefined : `translateY(${vItem.start}px)`,
			}}
			ref={(node) => rowVirtualizer.measureElement(node!)}
		>
			{children}
		</View>
	);
}

export { Root, List, Item, useItemContext, useRootContext };
