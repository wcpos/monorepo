import * as React from 'react';
import { View, type ViewStyle } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SortableContextProvider } from './context';
import { SortableItem } from './sortable-item';
import type { SortableListProps } from './types';

/**
 * A container component for creating sortable lists with drag-and-drop functionality.
 *
 * Uses react-native-gesture-handler for gesture detection and react-native-reanimated
 * for smooth 60fps animations.
 *
 * @example
 * ```tsx
 * <SortableList
 *   listId="my-list"
 *   items={items}
 *   getItemId={(item) => item.id}
 *   onOrderChange={({ items }) => setItems(items)}
 *   renderItem={(item) => <MyItem item={item} />}
 * />
 * ```
 */
function SortableListInner<T>({
	listId,
	items,
	getItemId,
	renderItem,
	onOrderChange,
	gap = 8,
	axis = 'vertical',
	style,
	hapticFeedback = true,
}: SortableListProps<T>) {
	// Container style based on axis
	const containerStyle = React.useMemo<ViewStyle>(
		() => ({
			flexDirection: axis === 'vertical' ? 'column' : 'row',
			gap,
			...style,
		}),
		[axis, gap, style]
	);

	return (
		<SortableContextProvider
			listId={listId}
			gap={gap}
			axis={axis}
			items={items}
			getItemId={getItemId}
			onOrderChange={onOrderChange}
		>
			<View style={containerStyle}>
				{items.map((item, index) => {
					const itemId = getItemId(item);
					return (
						<SortableItem key={itemId} id={itemId}>
							{renderItem(item, index)}
						</SortableItem>
					);
				})}
			</View>
		</SortableContextProvider>
	);
}

/**
 * Memoized SortableList to prevent unnecessary re-renders
 */
export const SortableList = React.memo(SortableListInner) as typeof SortableListInner;

/**
 * Wrapper component that includes GestureHandlerRootView.
 * Use this if your app doesn't already have a GestureHandlerRootView at the root.
 */
export function SortableListWithGestureHandler<T>(props: SortableListProps<T>) {
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<SortableList {...props} />
		</GestureHandlerRootView>
	);
}

/**
 * Utility function to reorder an array based on drag result.
 * This is the same as the web version - platform agnostic.
 */
export function reorder<T>(list: T[], fromIndex: number, toIndex: number): T[] {
	const result = Array.from(list);
	const [removed] = result.splice(fromIndex, 1);
	result.splice(toIndex, 0, removed);
	return result;
}
