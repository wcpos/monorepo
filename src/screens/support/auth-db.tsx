import * as React from 'react';
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

	const printToConsole = async (table: string) => {
		const data = await usersDatabase.collections.map[table].query().fetch();
		console.log(data);
	};

	const columns = [
		{ key: 'name', label: 'Name' },
		{ key: 'count', label: 'Count' },
		{ key: 'actions', label: '' },
	];

	return (
		<Table columns={columns} data={tableCounts}>
			<Table.Header>
				<Table.HeaderRow>
					{columns.map(({ key, flexGrow, flexShrink, width, label }) => {
						return (
							<Table.HeaderRow.HeaderCell
								key={key}
								dataKey={key}
								flexGrow={flexGrow}
								flexShrink={flexShrink}
								width={width}
								sort={() => {
									console.log('sort');
								}}
								sortBy="name"
								sortDirection="asc"
							>
								{label}
							</Table.HeaderRow.HeaderCell>
						);
					})}
				</Table.HeaderRow>
			</Table.Header>
			<Table.Body>
				{({ item }) => (
					<Table.Row rowData={item} columns={columns}>
						{({ column, getCellProps }) => {
							if (column.key === 'actions') {
								return (
									<Table.Row.Cell>
										<Button
											title="Delete"
											onPress={() => {
												deleteAll(item.name);
											}}
										/>
										<Button
											title="Info"
											onPress={() => {
												printToConsole(item.name);
											}}
										/>
									</Table.Row.Cell>
								);
							}
							return <Table.Row.Cell {...getCellProps()} />;
						}}
					</Table.Row>
				)}
			</Table.Body>
		</Table>
	);
};

export default Sites;
