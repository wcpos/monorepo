import React from 'react';
import useDatabase from '../../hooks/use-database';
import useObservable from '../../hooks/use-observable';

import Table from '../../components/table';
import Button from '../../components/button';

// import database from '../../database';

const Support = () => {
	const { storeDB } = useDatabase();
	const tableCounts = Object.keys(storeDB.collections.map).reduce((result: any[], key) => {
		result.push({
			name: key,
			count: useObservable(storeDB.collections.map[key].query().observeCount(), []),
		});
		return result;
	}, []);

	const deleteAll = async (table: string) => {
		const query = storeDB.collections.map[table].query();
		await query.destroyAllPermanently();
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

	return <Table columns={columns} items={tableCounts} />;
};

export default Support;
