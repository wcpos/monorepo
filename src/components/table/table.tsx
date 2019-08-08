import React from 'react';
import { FlatList } from 'react-native';
import Row from './row';
import Header from './header';
import { ColumnProps, Sort, SortDirection } from './';
import Text from '../text';

type Props = {
	style?: any;
	items: any[];
	columns: ColumnProps[];
	sort?: Sort;
	sortBy?: string;
	sortDirection?: SortDirection;
	footer?: React.ReactNode;
	empty?: React.ReactNode;
};

const Table = ({ items, columns, sort, sortBy, sortDirection, footer, empty }: Props) => {
	const renderItem = ({ item }: any) => <Row rowData={item} columns={columns} />;
	const keyExtractor = (item: any, index: number) => item.id;

	return (
		<FlatList
			data={items}
			renderItem={renderItem}
			keyExtractor={keyExtractor}
			ListHeaderComponent={
				<Header columns={columns} sort={sort} sortBy={sortBy} sortDirection={sortDirection} />
			}
			ListFooterComponent={footer}
			ListEmptyComponent={<Text>{empty}</Text>}
		/>
	);
};

export default Table;
