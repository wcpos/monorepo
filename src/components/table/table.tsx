import React from 'react';
import { FlatList } from 'react-native';
import Body from './body';
import Header from './header';
import Row from './row';
import HeaderRow from './header-row';
import Text from '../text';

type Props = {
	children?: import('react-native').ListRenderItem<any>;
	columns: import('./types').ColumnProps[];
	data: any[];
	empty?: React.ReactNode;
	footer?: React.ReactNode;
	sort?: import('./types').Sort;
	sortBy?: string;
	sortDirection?: import('./types').SortDirection;
	style?: any;
};

const Table: React.FC<Props> = ({
	children,
	columns,
	data,
	empty,
	footer,
	sort,
	sortBy,
	sortDirection,
}) => {
	const keyExtractor = (item: any, index: number) => item.id || index;
	const childCount = React.Children.count(children);
	let renderItem = ({ item }: any) => <Row rowData={item} columns={columns} />;
	let headerComponent = (
		<HeaderRow columns={columns} sort={sort} sortBy={sortBy} sortDirection={sortDirection} />
	);

	// sub components
	if (childCount > 0) {
		children.map((child) => {
			if (child.type.name === 'Header') {
				headerComponent = React.cloneElement(child.props.children, {
					columns,
					sort,
					sortBy,
					sortDirection,
				});
			}
			if (child.type.name === 'Body') {
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
