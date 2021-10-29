import * as React from 'react';
import { FlatList, Text } from 'react-native';
import useData from '@wcpos/common/src/hooks/use-collection-query';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';

const Table = () => {
	const { data } = useData('products');

	const renderItem = React.useCallback(({ item }) => <Text>{item.name}</Text>, []);
	const keyExtractor = React.useCallback((item) => item.localID, []);
	const getItemLayout = React.useCallback(
		(data, index) => ({
			length: 16,
			offset: 16 * index,
			index,
		}),
		[]
	);

	useWhyDidYouUpdate('Table', { data });

	return (
		<FlatList
			// @ts-ignore
			data={data}
			renderItem={renderItem}
			keyExtractor={keyExtractor}
			getItemLayout={getItemLayout}
		/>
	);
};

export default Table;
