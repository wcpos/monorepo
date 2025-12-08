import { View } from 'react-native';
import type { ViewProps } from 'react-native';

import type { FlashListProps } from '@shopify/flash-list';

type RootProps = ViewProps & {
	/** Horizontal instead of vertical list */
	horizontal?: boolean;
};

interface VirtualizedListHandle {
	scrollToIndex(params: {
		index: number;
		align?: 'start' | 'center' | 'end';
		animated?: boolean;
	}): void;
	scrollToOffset(offset: number, animated?: boolean): void;
	/** Horizontal instead of vertical list */
	horizontal?: boolean;
}

type ListProps<T> = {
	ref?: React.Ref<any>;

	/** Dataset – keep it immutable for perf */
	data: readonly T[];

	// /** Cell renderer – receives the logical index */
	renderItem: NonNullable<FlashListProps<T>['renderItem']>;

	/** Average/constant item size (px).  Required for perf */
	estimatedItemSize: number;

	/** Number of extra items to render outside the viewport */
	overscan?: number; // default 4

	/** Key extractor (falls back to index) */
	keyExtractor?: (item: T, index: number) => string;

	/** Infinite scroll */
	onEndReached?: () => void;
	onEndReachedThreshold?: number; // 0-1, default 0.5

	/** fallback UI when data.length === 0 */
	ListEmptyComponent?: FlashListProps<T>['ListEmptyComponent'];

	/**
	 * The host component you want to use as *the parent* of all your rows.
	 * Defaults to View.
	 */
	parentComponent?: typeof View;

	/** Any props you'd normally pass to that wrapper. */
	parentProps?: Omit<React.ComponentProps<typeof View>, 'children'>;

	/**
	 * Extra data that, when changed, will trigger a re-render of all items.
	 * Useful for forcing re-renders when data outside of `data` array changes
	 * (e.g., column visibility, selection state, etc.)
	 */
	extraData?: any;

	/**
	 * Type extractor for heterogeneous lists
	 */
	getItemType?: (item: T) => string;

	/** Footer component */
	ListFooterComponent?: FlashListProps<T>['ListFooterComponent'];
};

type ItemProps<T> = ViewProps & {
	ref?: React.Ref<any>;
	item: T;
	index: number;
};

/**
 * Shape of the global list context for VirtualizedList
 * Includes the data array and the TanStack Virtualizer instance.
 * Union with null to allow createContext default.
 */
type RootContext = {
	ref: React.RefObject<HTMLDivElement | null>;
	scrollElement: HTMLDivElement | null;
	horizontal?: boolean;
} | null;

/**
 * Shape of the per-item context for each virtual slot
 */
interface ItemContext<T = any> {
	/** The actual item data for this slot */
	item: T;
	/** Index of the item in the data array */
	index: number;
}

export type { ItemContext, ItemProps, ListProps, RootContext, RootProps, VirtualizedListHandle };
