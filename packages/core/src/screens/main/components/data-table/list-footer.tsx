import * as React from 'react';
import { View } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';

import { Loader } from '@wcpos/components/loader';

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

export function ListFooterComponent({ active$ }: { active$: Observable<boolean> }) {
	return <LoadingFooter active$={active$} />;
}
