import * as React from 'react';

import {
	EMPTY_COLLECTION_COUNTS,
	type EngineCollectionCounts,
	type EngineMutationCounts,
	observeCollectionCounts,
	observeQueueCounts,
	useQueryRuntime,
} from '@wcpos/query';
import type { EngineStatus } from '@wcpos/sync-engine';
export type { EngineCollectionCounts, EngineMutationCounts } from '@wcpos/query';

export function useEngineStatus(): EngineStatus {
	const { engine } = useQueryRuntime();
	const [status, setStatus] = React.useState<EngineStatus>(() => engine.status());

	React.useEffect(() => {
		// The engine owns this external subscription; bind it to the hook lifecycle.
		return engine.statusChanges(setStatus);
	}, [engine]);

	return status;
}

export function useCollectionCounts(): EngineCollectionCounts {
	const { engine } = useQueryRuntime();
	const [counts, setCounts] = React.useState<EngineCollectionCounts>(EMPTY_COLLECTION_COUNTS);

	React.useEffect(() => {
		// RxDB count streams are external subscriptions and must follow the active engine lifecycle.
		const subscription = observeCollectionCounts(engine).subscribe(setCounts);
		return () => subscription.unsubscribe();
	}, [engine]);

	return counts;
}

export function useMutationCounts(): EngineMutationCounts {
	const { engine } = useQueryRuntime();
	const [counts, setCounts] = React.useState<EngineMutationCounts>({
		syncBacklog: 0,
		syncBacklogSales: 0,
		needsDecision: 0,
		needsDecisionRejected: 0,
		needsDecisionUnresolved: 0,
	});

	React.useEffect(() => {
		// RxDB mutation selectors are external subscriptions and must follow the active engine lifecycle.
		const subscription = observeQueueCounts(engine).subscribe(setCounts);
		return () => subscription.unsubscribe();
	}, [engine]);

	return counts;
}
