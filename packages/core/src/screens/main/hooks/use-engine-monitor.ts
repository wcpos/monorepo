import * as React from 'react';

import {
	observeEngineCollectionCounts,
	observeEngineMutationCounts,
	useQueryManager,
} from '@wcpos/query';
import type { EngineCollectionCounts, EngineMutationCounts, EngineStatus } from '@wcpos/query';

const EMPTY_COLLECTION_COUNTS: EngineCollectionCounts = {
	orders: 0,
	products: 0,
	variations: 0,
	customers: 0,
	taxRates: 0,
	categories: 0,
	brands: 0,
	tags: 0,
	coupons: 0,
};

export function useEngineStatus(): EngineStatus {
	const { engine } = useQueryManager();
	const [status, setStatus] = React.useState<EngineStatus>(() => engine.status());

	React.useEffect(() => {
		// The engine owns this external subscription; bind it to the hook lifecycle.
		return engine.statusChanges(setStatus);
	}, [engine]);

	return status;
}

export function useCollectionCounts(): EngineCollectionCounts {
	const { engine } = useQueryManager();
	const [counts, setCounts] = React.useState<EngineCollectionCounts>(EMPTY_COLLECTION_COUNTS);

	React.useEffect(() => {
		// RxDB count streams are external subscriptions and must follow the active engine lifecycle.
		return observeEngineCollectionCounts(engine, setCounts);
	}, [engine]);

	return counts;
}

export function useMutationCounts(): EngineMutationCounts {
	const { engine } = useQueryManager();
	const [counts, setCounts] = React.useState<EngineMutationCounts>({ pending: 0, conflicts: 0 });

	React.useEffect(() => {
		// RxDB mutation selectors are external subscriptions and must follow the active engine lifecycle.
		return observeEngineMutationCounts(engine, setCounts);
	}, [engine]);

	return counts;
}
