import { RXDB_VERSION } from 'rxdb/plugins/utils';
import { getRxStorageExpoAsync } from 'rxdb-premium/plugins/storage-filesystem-expo';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { NATIVE_STORAGE_HOST } from './native-storage-host';
import { withTargetedOpfsRecovery } from '../../plugins/opfs-targeted-recovery.mjs';
import {
	STORAGE_TIMING_PROBE_ENABLED,
	withStorageTimingProbe,
} from '../../plugins/storage-timing-probe';

import type { RxStorage } from 'rxdb';

function getJsThreadStorage(): RxStorage<unknown, unknown> {
	const rawStorage = getRxStorageExpoAsync();
	return withTargetedOpfsRecovery(
		STORAGE_TIMING_PROBE_ENABLED ? withStorageTimingProbe(rawStorage, 'raw') : rawStorage
	);
}

export function getNativeNewStorage(): RxStorage<unknown, unknown> {
	if (NATIVE_STORAGE_HOST === 'js-thread') return getJsThreadStorage();

	// Keep the synchronous RxStorage interface; all collections await the same host
	// selection, so an initialization failure cannot split them across two roots.
	let initialized: Promise<RxStorage<unknown, unknown>> | undefined;
	return {
		name: 'wcpos-native-storage',
		rxdbVersion: RXDB_VERSION,
		async createStorageInstance(params) {
			initialized ??= import('./worklet-host')
				.then(({ createWorkletStorage }) => createWorkletStorage())
				.then((storage) =>
					STORAGE_TIMING_PROBE_ENABLED
						? withStorageTimingProbe(storage, 'raw-worklet-round-trip')
						: storage
				)
				.catch((error: unknown) => {
					getLogger(['wcpos', 'db', 'storage']).error(
						'Worklet storage initialization failed; falling back to JS-thread storage',
						{
							code: ERROR_CODES.LOCAL_DB_SETUP_FAILED,
							context: { error: error instanceof Error ? error.message : String(error) },
						}
					);
					return getJsThreadStorage();
				});
			return (await initialized).createStorageInstance(params);
		},
	};
}
