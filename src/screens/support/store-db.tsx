import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import map from 'lodash/map';
import forEach from 'lodash/forEach';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Table from '@wcpos/common/src/components/table';
import Button from '@wcpos/common/src/components/button';

type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
type Collection = import('rxdb/plugins/core').RxCollection;

const Row = ({ item, columns }: { item: Collection; columns: any[] }) => {
	const count = useObservableState(item.totalRecords$);

	return (
		<Table.Body.Row rowData={item} columns={columns}>
			{({ column }: any) => {
				switch (column.key) {
					case 'name':
						return <Table.Body.Row.Cell cellData={item.name} />;
					case 'count':
						return <Table.Body.Row.Cell cellData={count} />;
					case 'actions':
						return (
							<Table.Body.Row.Cell>
								<Button
									title="Delete All"
									onPress={() => {
										item.remove();
									}}
								/>
							</Table.Body.Row.Cell>
						);
					default:
						return null;
				}
			}}
		</Table.Body.Row>
	);
};

const StoreDB = () => {
	const { storeDB } = useAppState() as { storeDB: StoreDatabase };

	const columns = [
		{ key: 'name', label: 'Name' },
		{ key: 'count', label: 'Count' },
		{ key: 'actions', label: '' },
	];

	return (
		<Table columns={columns} data={Object.values(storeDB.collections)}>
			<Table.Header>
				<Table.Header.Row>
					{columns.map(({ key, label }) => {
						return (
							<Table.Header.Row.Cell
								key={key}
								dataKey={key}
								sort={() => {
									console.log('sort');
								}}
								sortBy="name"
								sortDirection="asc"
							>
								{label}
							</Table.Header.Row.Cell>
						);
					})}
				</Table.Header.Row>
			</Table.Header>
			<Table.Body>{({ item }: any) => <Row item={item} columns={columns} />}</Table.Body>
		</Table>
	);
};

export default StoreDB;
