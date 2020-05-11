import React from 'react';
import Table from '../../components/table';
import Button from '../../components/button';
import { sitesDatabase } from '../../database';
import useObservable from '../../hooks/use-observable';

interface Props {}

const Sites: React.FC<Props> = () => {
	const tableCounts = Object.keys(sitesDatabase.collections.map).reduce((result: any[], key) => {
		result.push({
			name: key,
			count: useObservable(sitesDatabase.collections.map[key].query().observeCount(), []),
		});
		return result;
	}, []);

	const deleteAll = async (table: string) => {
		const query = sitesDatabase.collections.map[table].query();
		await sitesDatabase.action(async () => {
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

	return <Table columns={columns} items={tableCounts} />;
};

export default Sites;
