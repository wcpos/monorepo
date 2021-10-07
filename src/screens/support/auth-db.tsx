import * as React from 'react';
import Table from '@wcpos/common/src/components/table';
import Button from '@wcpos/common/src/components/button';
import useUser from '@wcpos/common/src/hooks/use-user';
import forEach from 'lodash/forEach';
import map from 'lodash/map';

type UserDatabase = import('@wcpos/common/src/database').UserDatabase;

const AuthDB = () => {
	// const { userDB } = useUser();
	const [counts, setCounts] = React.useState<any[]>([]);

	// subscribe to all collection changes
	// forEach(userDB.collections, (collection, key) => {
	// 	collection.$.subscribe((changeEvent) => console.log(key, changeEvent));
	// });

	React.useEffect(() => {
		(async function init() {
			// const promises = map(userDB.collections, async (collection, key) => {
			// 	const records = await collection.find().exec();
			// 	return {
			// 		name: key,
			// 		count: records.length,
			// 	};
			// });
			// const resolved = await Promise.all(promises);
			// setCounts(resolved);
		})();
	}, []);
	const deleteAll = async (table: string) => {
		// const query = userDB.collections.map[table].query();
		// await userDB.action(async () => {
		// 	await query.destroyAllPermanently();
		// });
	};

	const printToConsole = async (collection: string) => {
		// @ts-ignore
		const data = await userDB.collections[collection].find().exec();
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
				<Table.Header.Row>
					{columns.map(({ key, label }) => {
						return (
							<Table.Header.Row.Cell
								key={key}
								dataKey={key}
								// flexGrow={flexGrow}
								// flexShrink={flexShrink}
								// width={width}
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
						{({ column, getCellProps }: any) => {
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
												printToConsole(item.name);
											}}
										/>
									</Table.Body.Row.Cell>
								);
							}
							return <Table.Body.Row.Cell {...getCellProps()} />;
						}}
					</Table.Body.Row>
				)}
			</Table.Body>
		</Table>
	);
};

export default AuthDB;
