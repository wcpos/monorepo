import * as React from 'react';
import { View } from 'react-native';

import { useVirtualizer } from '@tanstack/react-virtual';

import { ItemContext, RootContext, useItemContext, useRootContext } from './utils/contexts';

import type { BaseItemContext, ItemProps, ListProps, RootProps } from './types';

function Root({ style, ...props }: RootProps) {
	const parentRef = React.useRef<HTMLDivElement>(null);
	const [scrollElement, setScrollElement] = React.useState<HTMLDivElement | null>(null);

	React.useEffect(() => {
		if (parentRef.current) {
			setScrollElement(parentRef.current);
		}
	}, []);

	return (
		<RootContext.Provider value={{ ref: parentRef, scrollElement }}>
			<View {...props} ref={parentRef} style={[{ overflow: 'auto', display: 'block' }, style]} />
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
	horizontal = false,
	keyExtractor,
	onEndReached,
	onEndReachedThreshold = 0.5,
	...rest
}: ListProps<T>) {
	const { scrollElement } = useRootContext();

	// set up virtualizer
	const rowVirtualizer = useVirtualizer({
		count: data.length,
		getScrollElement: () => scrollElement,
		horizontal,
		overscan,
		estimateSize: () => estimatedItemSize,
		...rest,
	});

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

	// fire onEndReached when within threshold of end
	const endReachedRef = React.useRef(false);
	React.useEffect(() => {
		if (!scrollElement || typeof onEndReached !== 'function') return;

		const container = scrollElement;
		const handleScroll = () => {
			const offset = horizontal ? container.scrollLeft : container.scrollTop;
			const viewSize = horizontal ? container.clientWidth : container.clientHeight;
			const fullSize = horizontal ? container.scrollWidth : container.scrollHeight;

			const distanceFromEnd = fullSize - (offset + viewSize);

			// when within threshold → fire once
			if (distanceFromEnd <= viewSize * onEndReachedThreshold) {
				if (!endReachedRef.current) {
					onEndReached();
					endReachedRef.current = true;
				}
			} else {
				// reset when scrolled away
				endReachedRef.current = false;
			}
		};

		container.addEventListener('scroll', handleScroll);
		handleScroll();
		return () => container.removeEventListener('scroll', handleScroll);
	}, [scrollElement, horizontal, onEndReached, onEndReachedThreshold]);

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
				const key = keyExtractor ? keyExtractor(item, vItem.index) : String(vItem.key);

				return (
					<ItemContext.Provider
						key={key}
						value={
							{ item, index: vItem.index, rowVirtualizer, vItem, horizontal } as BaseItemContext<T>
						}
					>
						{renderItem({ item, index: vItem.index, target: 'Cell' })}
					</ItemContext.Provider>
				);
			})}
		</Parent>
	);
}

function Item({ children, ...props }: ItemProps<any>) {
	const { index, rowVirtualizer, vItem, horizontal } = useItemContext() as BaseItemContext<any>;

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
