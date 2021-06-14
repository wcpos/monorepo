import * as React from 'react';
import { FlatListProps } from 'react-native';
import { FlatList } from 'react-native-gesture-handler'; // swipeable rows?
import get from 'lodash/get';
import Row from './row';
import HeaderRow from './header-row';
import Body from './body';
import Header from './header';
import Text from '../text';

export interface TableProps {
	children?: React.ReactNode;
	columns: import('./types').ColumnProps[];
	data: any[];
	empty?: React.ReactElement;
	footer?: React.ReactElement;
	sort?: import('./types').Sort;
	sortBy?: string;
	sortDirection?: import('./types').SortDirection;
	style?: any;
}

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
	// const keyExtractor = (item: any, index: number) => item._id || index;
	const keyExtractor = React.useCallback(
		(item: any, index: number) => get(item, '_id') || index,
		[]
	);
	const childCount = React.Children.count(children);
	let renderItem = ({ item }: any) => <Row rowData={item} columns={columns} />;

	let headerComponent = (
		<HeaderRow columns={columns} sort={sort} sortBy={sortBy} sortDirection={sortDirection} />
	);

	// sub components
	if (Array.isArray(children) && childCount > 0) {
		children.forEach((child) => {
			if (React.isValidElement(child)) {
				if (get(child, 'type.displayName') === 'Table.Header') {
					headerComponent = React.cloneElement(child?.props?.children, {
						columns,
						sort,
						sortBy,
						sortDirection,
					});
				}
				if (get(child, 'type.displayName') === 'Table.Body') {
					renderItem = child.props.children;
				}
			}
		});
	}

	// function
	if (typeof children === 'function') {
		// @ts-ignore
		renderItem = children;
	}

	return (
		<FlatList
			data={data}
			renderItem={renderItem}
			keyExtractor={keyExtractor}
			ListHeaderComponent={headerComponent}
			ListFooterComponent={footer}
			ListEmptyComponent={<Text>{empty}</Text>}
			stickyHeaderIndices={[0]}
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
