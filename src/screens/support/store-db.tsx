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

	const printToConsole = async (collection: string) => {
		// @ts-ignore
		const data = await storeDB.collections[collection].find().exec();
		console.log(data);
	};

	const columns = [
		{ key: 'name', label: 'Name' },
		{ key: 'count', label: 'Count' },
		{ key: 'actions', label: '' },
	];

	return (
		<Table columns={columns} data={counts}>
			<Table.Header>
				<Table.HeaderRow>
					{columns.map(({ key, label }) => {
						return (
							<Table.HeaderRow.HeaderCell
								key={key}
								dataKey={key}
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
				{({ item }: any) => (
					<Table.Row rowData={item} columns={columns}>
						{({ cellData, column }: any) => {
							if (column.key === 'actions') {
								return (
									<Table.Row.Cell>
										<Button
											title="Delete All"
											onPress={() => {
												deleteAll(item.name);
											}}
										/>
										<Button
											title="Info"
											onPress={() => {
												console.log(item.name);
											}}
										/>
									</Table.Row.Cell>
								);
							}
							return <Table.Row.Cell cellData={cellData} />;
						}}
					</Table.Row>
				)}
			</Table.Body>
		</Table>
	);
};

export default StoreDB;
function countRecords() {
	throw new Error('Function not implemented.');
}
