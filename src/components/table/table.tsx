import React, { Fragment } from 'react';
import { FlatList } from 'react-native';
import Row from './row';
import Header from './header';
import { ColumnProps, Sort, SortDirection } from './';

type Props = {
	style?: any;
	items: any[];
	columns: ColumnProps[];
	sort?: Sort;
	sortBy?: string;
	sortDirection?: SortDirection;
};

const Table = ({ items, columns, sort, sortBy, sortDirection }: Props) => {
	const renderItem = ({ item }: any) => <Row rowData={item} columns={columns} />;
	const keyExtractor = (item: any, index: number) => item.id;

	return (
		<Fragment>
			<Header columns={columns} sort={sort} sortBy={sortBy} sortDirection={sortDirection} />
			<FlatList data={items} renderItem={renderItem} keyExtractor={keyExtractor} />
		</Fragment>
	);
};

export default Table;
