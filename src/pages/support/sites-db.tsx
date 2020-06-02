import React from 'react';
import Table from '../../components/table';
import Button from '../../components/button';
import { usersDatabase } from '../../database';
import useObservable from '../../hooks/use-observable';

interface Props {}

const Sites: React.FC<Props> = () => {
	const tableCounts = Object.keys(usersDatabase.collections.map).reduce((result: any[], key) => {
		result.push({
			name: key,
			count: useObservable(usersDatabase.collections.map[key].query().observeCount(), []),
		});
		return result;
	}, []);

	const deleteAll = async (table: string) => {
		const query = usersDatabase.collections.map[table].query();
		await usersDatabase.action(async () => {
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

export default Sites;
