import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import { useDataTable } from '@wcpos/components/src/data-table';
import { Loader } from '@wcpos/components/src/loader';
import { useReplicationState } from '@wcpos/query';

export const ListFooterComponent = () => {
	const { query } = useDataTable();
	const { active$ } = useReplicationState(query);
	const loading = useObservableState(active$, false);

	if (!loading) return null;

	return (
		<View className="items-center justify-center p-2 bg-card">
			<Loader />
		</View>
	);
};
