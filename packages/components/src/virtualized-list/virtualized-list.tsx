import * as React from 'react';
import { View } from 'react-native';

import { FlashList } from '@shopify/flash-list';

import { ItemContext, RootContext, useItemContext, useRootContext } from './utils/contexts';

import type { FlashListRef } from '@shopify/flash-list';
import type { ItemContext as BaseItemContext, ListProps, RootProps } from './types';

function Root(props: RootProps) {
	return (
		<RootContext.Provider value={null}>
			<View {...props} style={{ flex: 1 }} />
		</RootContext.Provider>
	);
}

function List<T>({
	ref,
	data,
	renderItem,
	ListEmptyComponent = null,
	parentComponent: Parent = View,
	parentProps,
	estimatedItemSize,
	overscan = 4,
	onEndReached,
	onEndReachedThreshold = 0.5,
	keyExtractor,
	extraData,
	getItemType,
	ListFooterComponent,
}: ListProps<T>) {
	const flashRef = React.useRef<FlashListRef<T>>(null);

	React.useImperativeHandle(ref, () => ({
		scrollToIndex: ({
			index,
			align = 'start',
			animated = true,
		}: {
			index: number;
			align?: 'start' | 'center' | 'end';
			animated?: boolean;
		}) =>
			flashRef.current?.scrollToIndex({
				index,
				animated,
				viewPosition: align === 'end' ? 1 : align === 'center' ? 0.5 : 0,
			}),
		scrollToOffset: (offset: number, animated = true) =>
			flashRef.current?.scrollToOffset({ offset, animated }),
	}));

	// merge user‐passed wrapper props (e.g. style) with required
	const wrapperProps = {
		...parentProps,
		style: { height: '100%', ...((parentProps?.style || {}) as any) },
	} as React.ComponentProps<typeof Parent>;

	return (
		<Parent {...wrapperProps}>
			<FlashList
				ref={flashRef}
				data={data}
				renderItem={({ item, index, ...rest }) => {
					const key = keyExtractor ? keyExtractor(item, index) : String(index);
					return (
						<ItemContext.Provider key={key} value={{ item, index } as BaseItemContext<T>}>
							{renderItem({ item, index, ...rest })}
						</ItemContext.Provider>
					);
				}}
				drawDistance={overscan * estimatedItemSize}
				onEndReached={onEndReached}
				onEndReachedThreshold={onEndReachedThreshold}
				ListEmptyComponent={ListEmptyComponent}
				extraData={extraData}
				getItemType={getItemType}
				ListFooterComponent={ListFooterComponent}
			/>
		</Parent>
	);
}

function Item({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}

export { Item, List, Root, useItemContext, useRootContext };
