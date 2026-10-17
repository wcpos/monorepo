import * as React from 'react';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { loadRest } from '@wcpos/core/screens/main/rest/lazy';

const Screen = React.lazy(() => loadRest().then((m) => ({ default: m.MiniAppHost })));

export default function MiniAppRoute() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	return (
		<React.Suspense fallback={null}>
			<Screen id={id} onClose={() => router.back()} />
		</React.Suspense>
	);
}
