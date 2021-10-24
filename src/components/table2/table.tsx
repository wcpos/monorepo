import * as React from 'react';
import { FlatListProps, ListRenderItem } from 'react-native';
import { FlatList } from 'react-native-gesture-handler'; // swipeable rows?
import get from 'lodash/get';
import Row from './row';
// import HeaderRow from './header-row';
// import Body from './body';
// import Header from './header';
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
	const keyExtractor = React.useCallback(
		(item: any, index: number) => get(item, 'localID') || index,
		[]
	);
	// const childCount = React.Children.count(children);
	const renderItem = React.useCallback(
		({ item }: any) => <Row rowData={item} columns={columns} />,
		[columns]
	);

	return (
		<FlatList
			data={data}
			renderItem={renderItem}
			keyExtractor={keyExtractor}
			// ListHeaderComponent={headerComponent}
			ListFooterComponent={footer}
			ListEmptyComponent={<Text>{empty}</Text>}
			stickyHeaderIndices={[0]}
			viewabilityConfig={{
				minimumViewTime: 500,
				viewAreaCoveragePercentThreshold: 0,
			}}
			{...rest}
		/>
	);
};

export default Table;
