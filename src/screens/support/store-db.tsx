import * as React from 'react';
import map from 'lodash/map';
import forEach from 'lodash/forEach';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Table from '@wcpos/common/src/components/table';
import Button from '@wcpos/common/src/components/button';

type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;

const StoreDB = () => {
	const { storeDB } = useAppState() as { storeDB: StoreDatabase };
	const [counts, setCounts] = React.useState<any[]>([]);

	// subscribe to all collection changes
	forEach(storeDB.collections, (collection, key) => {
		collection.$.subscribe((changeEvent) => console.log(key, changeEvent));
	});

	React.useEffect(() => {
		(async function init() {
			const promises = map(storeDB.collections, async (collection, key) => {
				const records = await collection.find().exec();
				return {
					name: key,
					count: records.length,
					records,
				};
			});
			const resolved = await Promise.all(promises);

			setCounts(resolved);
		})();
	}, []);

	const deleteAll = async (name: string) => {
		// @ts-ignore
		const collection = storeDB.collections[name];
		const result = await collection.remove();
		console.log(result);

		// await storeDB.action(async () => {
		// 	await query.destroyAllPermanently();
		// });
	};

	const printRecordsToConsole = async (collection: []) => {
		console.log(collection);
	};

	const columns = [
		{ key: 'name', label: 'Name' },
		{ key: 'count', label: 'Count' },
		{ key: 'actions', label: '' },
	];

	return (
		<Table columns={columns} data={counts}>
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
			<Table.Body>
				{({ item }: any) => (
					<Table.Body.Row rowData={item} columns={columns}>
						{({ cellData, column }: any) => {
							if (column.key === 'actions') {
								return (
									<Table.Body.Row.Cell>
										<Button
											title="Delete All"
											onPress={() => {
												deleteAll(item.name);
											}}
										/>
										<Button
											title="Info"
											onPress={() => {
												printRecordsToConsole(item.records);
											}}
										/>
									</Table.Body.Row.Cell>
								);
							}
							return <Table.Body.Row.Cell cellData={cellData} />;
						}}
					</Table.Body.Row>
				)}
			</Table.Body>
		</Table>
	);
};

export default StoreDB;
function countRecords() {
	throw new Error('Function not implemented.');
}
