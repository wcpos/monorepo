import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import Table from '@wcpos/components/src/simple-table';
import Text from '@wcpos/components/src/text';
import Tree from '@wcpos/components/src/tree';

import { useQueryManager } from '../provider';

const QueryKeyCell = ({ item: query, column }) => {
	return (
		<Button
			size="small"
			onPress={() => {
				console.log(query);
			}}
		>
			{query.id}
		</Button>
	);
};

const QueryParamsCell = ({ item: query, column }) => {
	const params = useObservableState(query.params$, query.getParams());
	return <Tree rootName="params" data={params} />;
};

const ReplicationStateButton = ({ replication }) => {
	const active = useObservableState(replication.active$, false);
	return (
		<Box horizontal>
			<Button
				type={active ? 'success' : 'secondary'}
				size="small"
				key={replication.endpoint}
				onPress={() => {
					console.log(replication);
				}}
			>
				{replication.endpoint}
			</Button>
		</Box>
	);
};

const ReplicationsCell = ({ item: query, column }) => {
	const manager = useQueryManager();
	const replicationsMap = manager.getReplicationStatesByQueryID(query.id);
	const replicationsArray = Array.from(replicationsMap.values());
	return (
		<Box space="small">
			{replicationsArray.map((replication) => {
				return <ReplicationStateButton replication={replication} />;
			})}
		</Box>
	);
};

export const Devtools = () => {
	const manager = useQueryManager();
	const queriesMap = useObservableState(manager.queries.$, manager.queries.getAll());
	const queriesArray = Array.from(queriesMap.values());

	return Table({
		data: queriesArray,
		columns: [
			{
				key: 'queryKeys',
				label: 'Query Keys',
				width: 200,
				cellRenderer: QueryKeyCell,
			},
			{
				key: 'queryParams',
				label: 'Query Params',
				width: 200,
				cellRenderer: QueryParamsCell,
			},
			{
				key: 'replications',
				label: 'Replication States',
				cellRenderer: ReplicationsCell,
			},
		],
	});

	return (
		<Box>
			{queriesArray.map((query) => {
				const replicationsMap = manager.getReplicationStatesByQueryID(query.id);
				console.log(manager);
				const replicationsArray = Array.from(replicationsMap.values());
				return (
					<>
						<Text key={query.id}>{query.id}</Text>
						{replicationsArray.map((replication) => {
							return <Text key={replication.endpoint}>{replication.endpoint}</Text>;
						})}
					</>
				);
			})}
		</Box>
	);
};
