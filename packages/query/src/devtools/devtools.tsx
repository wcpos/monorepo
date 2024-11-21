import { ScrollView } from 'react-native';

import { useObservableState } from 'observable-hooks';
import { combineLatest } from 'rxjs';
import { filter, map } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import Table from '@wcpos/components/src/simple-table';
import Tree from '@wcpos/components/src/tree';

import { useQueryManager } from '../provider';
import { useReplicationState } from '../use-replication-state';

const QueryKeyCell = ({ item: query, column }) => {
	const { active$ } = useReplicationState(query);
	const active = useObservableState(active$, false);
	const cancel = useObservableState(query.cancel$, false);

	return (
		<Button
			type={cancel ? 'critical' : active ? 'success' : 'secondary'}
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
	return <Tree rootName="params" data={params} size="small" rawToggle={false} />;
};

const ReplicationStateButton = ({ replication }) => {
	const active = useObservableState(replication.active$, false);
	const cancel = useObservableState(replication.cancel$, false);
	return (
		<Box horizontal>
			<Button
				type={cancel ? 'critical' : active ? 'success' : 'secondary'}
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
	const { collectionReplication, queryReplication } = useReplicationState(query);

	return (
		<Box space="small">
			{collectionReplication && <ReplicationStateButton replication={collectionReplication} />}
			{queryReplication && <ReplicationStateButton replication={queryReplication} />}
		</Box>
	);
};

export const Devtools = () => {
	const manager = useQueryManager();
	const queriesMap = useObservableState(
		manager.queryStates.add$.pipe(map(() => manager.queryStates.getAll())),
		manager.queryStates.getAll()
	);
	const queriesArray = Array.from(queriesMap.values());

	return (
		<ScrollView style={{ maxHeight: 400 }}>
			<Table
				data={queriesArray}
				columns={[
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
				]}
			/>
		</ScrollView>
	);
};
