import * as React from 'react';
import Table from '@wcpos/common/src/components/table';
import Button from '@wcpos/common/src/components/button';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import forEach from 'lodash/forEach';
import map from 'lodash/map';

type UserDatabase = import('@wcpos/common/src/database').UserDatabase;

const AuthDB = () => {
	const { userDB } = useAppState() as { userDB: UserDatabase };
	const [counts, setCounts] = React.useState<any[]>([]);

	// subscribe to all collection changes
	forEach(userDB.collections, (collection, key) => {
		collection.$.subscribe((changeEvent) => console.log(key, changeEvent));
	});

	React.useEffect(() => {
		(async function init() {
			const promises = map(userDB.collections, async (collection, key) => {
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

export default AuthDB;
