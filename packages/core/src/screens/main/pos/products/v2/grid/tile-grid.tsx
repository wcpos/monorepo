import * as React from 'react';
import { View } from 'react-native';

import * as VirtualizedList from '@wcpos/components/virtualized-list';
import { useDocField } from '@wcpos/query';

import { useUISettings } from '../../../../contexts/ui-settings';

// Preserve the stage's 200 px initial row estimate until the shared list measures each row.
const ESTIMATED_ROW_PX = 200;

export function useGridColumns(): number {
	const { uiSettings } = useUISettings('pos-products');
	return useDocField(uiSettings, (value) => value.gridColumns);
}

/**
 * A row of Poster-framed tiles; empty frames keep a short row's widths equal. The caller hands
 * the columns it chunked by, so a row opens no settings read of its own.
 */
export function TileRow({
	columns,
	children,
}: {
	columns: number;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<View className="flex-row">
			{children}
			{Array.from({ length: columns - React.Children.count(children) }, (_, i) => (
				<View key={`spacer-${i}`} className="m-1 flex-1" />
			))}
		</View>
	);
}

interface TileGridProps<T> {
	tiles: readonly T[];
	renderTile: (tile: T) => React.ReactElement;
	rowKey?: (row: readonly T[], index: number) => string;
	onEndReached?: () => void;
	footer?: React.ReactElement;
	empty?: () => React.ReactElement;
	testID?: string;
}

/** The products stage's fixed-column, virtualised grid of Poster-framed tiles. */
export function TileGrid<T>({
	tiles,
	renderTile,
	rowKey,
	onEndReached,
	footer,
	empty,
	testID,
}: TileGridProps<T>): React.ReactElement {
	const columns = useGridColumns();
	const rows = React.useMemo(() => {
		const chunked: T[][] = [];
		for (let i = 0; i < tiles.length; i += columns) {
			chunked.push(tiles.slice(i, i + columns));
		}
		return chunked;
	}, [tiles, columns]);
	return (
		<VirtualizedList.Root testID={testID} style={{ flex: 1 }}>
			<VirtualizedList.List
				data={rows}
				keyExtractor={rowKey}
				renderItem={({ item: row }) => (
					<VirtualizedList.Item>
						<TileRow columns={columns}>{row.map(renderTile)}</TileRow>
					</VirtualizedList.Item>
				)}
				estimatedItemSize={ESTIMATED_ROW_PX}
				onEndReachedThreshold={0.1}
				onEndReached={onEndReached}
				ListFooterComponent={footer}
				ListEmptyComponent={empty}
			/>
		</VirtualizedList.Root>
	);
}
