import * as React from 'react';
import { View } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';

import { Loader } from '@wcpos/components/loader';
import { Query, useReplicationState } from '@wcpos/query';

import type { Observable } from 'rxjs';

function LoadingFooter({ active$ }: { active$: Observable<boolean> }) {
	const loading = useObservableEagerState(active$);

	if (!loading) return null;

	return (
		<View className="bg-card items-center justify-center p-2">
			<Loader />
		</View>
	);
}

function QueryLoadingFooter({ query }: { query: Query<any> }) {
	const { active$ } = useReplicationState(query);
	return <LoadingFooter active$={active$} />;
}

export function ListFooterComponent(
	props: { query: Query<any>; active$?: never } | { query?: never; active$: Observable<boolean> }
) {
	return props.query ? (
		<QueryLoadingFooter query={props.query} />
	) : (
		<LoadingFooter active$={props.active$} />
	);
}
