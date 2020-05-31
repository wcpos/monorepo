import React from 'react';
import { FlatList } from 'react-native';
import Row from './row';
import Header from './header';
import { ColumnProps, Sort, SortDirection } from './';
import Text from '../text';

type Props = {
	style?: any;
	data: any[];
	columns: ColumnProps[];
	sort?: Sort;
	sortBy?: string;
	sortDirection?: SortDirection;
	footer?: React.ReactNode;
	empty?: React.ReactNode;
};

const Table = ({ data, columns, sort, sortBy, sortDirection, footer, empty }: Props) => {
	const renderItem = ({ item }: any) => <Row rowData={item} columns={columns} />;
	const keyExtractor = (item: any, index: number) => item.id;

	return (
		<FlatList
			data={data}
			renderItem={renderItem}
			keyExtractor={keyExtractor}
			ListHeaderComponent={
				<Header columns={columns} sort={sort} sortBy={sortBy} sortDirection={sortDirection} />
			}
			ListFooterComponent={footer}
			ListEmptyComponent={<Text>{empty}</Text>}
			stickyHeaderIndices={[0]}
		/>
	);
};

export default Table;
