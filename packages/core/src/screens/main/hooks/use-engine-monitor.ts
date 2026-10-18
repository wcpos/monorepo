import * as React from 'react';

import {
	emptyCollectionCounts,
	type EngineCollectionCounts,
	type EngineMutationCounts,
	observeCollectionCounts,
	observeQueueCounts,
	useQueryRuntime,
} from '@wcpos/query';
import type { EngineStatus } from '@wcpos/sync-engine';
export type { EngineCollectionCounts, EngineMutationCounts } from '@wcpos/query';

export function useEngineStatus(): EngineStatus {
	const runtime = useQueryRuntime();
	const [status, setStatus] = React.useState<EngineStatus>(() => runtime.engine.status());

	React.useEffect(() => {
		// The engine owns this external subscription; bind it to the hook lifecycle.
		return runtime.engine.statusChanges(setStatus);
	}, [runtime.engine]);

	return status;
}

export function useCollectionCounts(): EngineCollectionCounts {
	const runtime = useQueryRuntime();
	const [counts, setCounts] = React.useState<EngineCollectionCounts>(emptyCollectionCounts);

	React.useEffect(() => {
		// RxDB count streams are external subscriptions and must follow the active engine lifecycle.
		const subscription = observeCollectionCounts(runtime.engine).subscribe(setCounts);
		return () => subscription.unsubscribe();
	}, [runtime.engine]);

	return counts;
}

export function useMutationCounts(): EngineMutationCounts {
	const runtime = useQueryRuntime();
	const [counts, setCounts] = React.useState<EngineMutationCounts>({
		syncBacklog: 0,
		syncBacklogSales: 0,
		needsDecision: 0,
		needsDecisionRejected: 0,
		needsDecisionUnresolved: 0,
	});

	React.useEffect(() => {
		// RxDB mutation selectors are external subscriptions and must follow the active engine lifecycle.
		const subscription = observeQueueCounts(runtime.engine).subscribe(setCounts);
		return () => subscription.unsubscribe();
	}, [runtime.engine]);

	return counts;
}
