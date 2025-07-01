import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import { Loader } from '@wcpos/components/loader';
import { Query, useReplicationState } from '@wcpos/query';

export function ListFooterComponent({ query }: { query: Query<any> }) {
	const { active$ } = useReplicationState(query);
	const loading = useObservableState(active$, false);

	if (!loading) return null;

	return (
		<View className="bg-card items-center justify-center p-2">
			<Loader />
		</View>
	);
}
