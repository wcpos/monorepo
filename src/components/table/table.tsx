import * as React from 'react';
import { FlatListProps, ListRenderItem } from 'react-native';
import { FlatList } from 'react-native-gesture-handler'; // swipeable rows?
import get from 'lodash/get';
import Row from './row';
import HeaderRow from './header-row';
import Body from './body';
import Header from './header';
import EmptyRow from './empty-row';

export interface TableProps {
	children?: React.ReactNode;
	columns: import('./types').ColumnProps[];
	data: any[];
	empty?: string;
	footer?: React.ReactElement;
	sort?: import('./types').Sort;
	sortBy?: string;
	sortDirection?: import('./types').SortDirection;
	style?: any;
}

/**
 * Tables rows must be onscreen for minimumViewTime to trigger onViewableItemsChanged
 */
const viewabilityConfig = {
	minimumViewTime: 500,
	viewAreaCoveragePercentThreshold: 0,
};

/**
 * Keeps the header row pinned to the top of the table
 */
const stickyHeaderIndices = [0];

const Table = ({
	children,
	columns,
	data,
	empty,
	footer,
	sort,
	sortBy,
	sortDirection,
	...rest
}: TableProps) => {
	const keyExtractor = React.useCallback(
		(item: any, index: number) => get(item, 'localId') || index,
		[]
	);
	const childCount = React.Children.count(children);

	/**
	 * create and memoize the renderItem function
	 */
	const renderItemFunction: ListRenderItem<typeof Row> = React.useMemo(() => {
		if (Array.isArray(children) && childCount > 0) {
			const child = children.find(({ type }: any) => type === Body);
			if (React.isValidElement(child)) {
				return ({ item, index }) => child.props.children({ item, columns, index });
			}
		}
		if (typeof children === 'function') {
			return ({ item, index }) => children({ item, columns, index });
		}
		return ({ item }: any) => <Row rowData={item} columns={columns} />;
	}, [children, childCount, columns]);

	const renderItem = React.useCallback(renderItemFunction, [renderItemFunction]);

	/**
	 * create and memoize the headerComponent
	 */
	const headerComponent = React.useMemo(() => {
		if (Array.isArray(children) && childCount > 0) {
			const child = children.find(({ type }: any) => type === Header);
			if (React.isValidElement(child)) {
				return React.cloneElement(child.props.children, {
					columns,
					sort,
					sortBy,
					sortDirection,
				});
			}
		}
		return (
			<HeaderRow columns={columns} sort={sort} sortBy={sortBy} sortDirection={sortDirection} />
		);
	}, [children, childCount, columns, sort, sortBy, sortDirection]);

	return (
		<FlatList
			data={data}
			renderItem={renderItem}
			keyExtractor={keyExtractor}
			ListHeaderComponent={headerComponent}
			ListFooterComponent={footer}
			ListEmptyComponent={EmptyRow}
			stickyHeaderIndices={stickyHeaderIndices}
			viewabilityConfig={viewabilityConfig}
			{...rest}
		/>
	);
};

/**
 * note: statics need to be added after React.memo
 */
const MemoizedTable = React.memo(Table) as unknown as React.FC<TableProps> & {
	Header: typeof Header;
	Body: typeof Body;
};
MemoizedTable.displayName = 'Table';
MemoizedTable.Header = Header;
MemoizedTable.Body = Body;

export default MemoizedTable;
