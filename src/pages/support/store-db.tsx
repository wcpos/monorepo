import React from 'react';
import useStore from '../../hooks/use-store';
import useObservable from '../../hooks/use-observable';
import Table from '../../components/table';
import Button from '../../components/button';
import { getStoreDatabase } from '../../database';
const store = getStoreDatabase({ site: 'test', user: 'test' });

interface Props {}

const Stores: React.FC<Props> = ({ header, main, title }) => {
	const tableCounts = Object.keys(store.collections.map).reduce((result: any[], key) => {
		result.push({
			name: key,
			count: useObservable(store.collections.map[key].query().observeCount(), []),
		});
		return result;
	}, []);

	const deleteAll = async (table: string) => {
		const query = store.collections.map[table].query();
		await store.action(async () => {
			await query.destroyAllPermanently();
		});
	};

	const columns = [
		{ key: 'name', label: 'Name' },
		{ key: 'count', label: 'Count' },
		{
			key: 'actions',
			label: '',
			cellRenderer: ({ rowData }: any) => (
				<Button title="Delete All" onPress={() => deleteAll(rowData.name)} />
			),
		},
	];

	return <Table columns={columns} data={tableCounts} />;
};

export default Stores;
