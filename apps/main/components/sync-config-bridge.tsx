import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { useAppState } from '@wcpos/core/contexts/app-state';
import { useQueryManager } from '@wcpos/query';

/**
 * Applies the store document's sync tuning (#559 knob contract) to the live
 * engine — on boot and whenever the fields change (any till editing the
 * per-store settings re-arms every till via replication). Values are clamped
 * again inside reconfigure(); this bridge just forwards.
 */
export function SyncConfigBridge() {
	const { engine } = useQueryManager();
	const { store } = useAppState();
	const checkIntervalMs = useObservableEagerState(store.sync_check_interval_ms$) as
		| number
		| undefined;
	const pullBatchSize = useObservableEagerState(store.sync_pull_batch_size$) as number | undefined;

	React.useEffect(() => {
		if (checkIntervalMs === undefined && pullBatchSize === undefined) return;
		engine.reconfigure({
			...(checkIntervalMs !== undefined ? { changeSignalPollMs: checkIntervalMs } : {}),
			...(pullBatchSize !== undefined ? { pullBatchSize } : {}),
		});
	}, [engine, checkIntervalMs, pullBatchSize]);

	return null;
}
