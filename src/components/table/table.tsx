import * as React from 'react';
import { FlatList } from 'react-native-gesture-handler'; // swipeable rows?
import Body from './body';
import Header from './header';
import Row from './row';
import HeaderRow from './header-row';
import Text from '../text';

export interface ITableProps {
	children?: import('react-native').ListRenderItem<any>;
	columns: import('./types').ColumnProps[];
	data: any[];
	empty?: React.ReactElement;
	footer?: React.ReactElement;
	sort?: import('./types').Sort;
	sortBy?: string;
	sortDirection?: import('./types').SortDirection;
	style?: any;
}

export const Table = ({
	children,
	columns,
	data,
	empty,
	footer,
	sort,
	sortBy,
	sortDirection,
}: ITableProps) => {
	const keyExtractor = (item: any, index: number) => item.id || index;
	const childCount = React.Children.count(children);
	let renderItem: React.FunctionComponent<any> = ({ item }: any) => (
		<Row rowData={item} columns={columns} />
	);
	let headerComponent = (
		<HeaderRow columns={columns} sort={sort} sortBy={sortBy} sortDirection={sortDirection} />
	);

	// sub components
	if (Array.isArray(children) && childCount > 0) {
		children.map((child) => {
			if (child?.type?.name === 'Header') {
				headerComponent = React.cloneElement(child?.props?.children, {
					columns,
					sort,
					sortBy,
					sortDirection,
				});
			}
			if (child?.type?.name === 'Body') {
				renderItem = child.props.children;
			}
		});
	}

	// function
	if (typeof children === 'function') {
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
		/>
	);
};

export default Object.assign(Table, { Header, Body, HeaderRow, Row });
