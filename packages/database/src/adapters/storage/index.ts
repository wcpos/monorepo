import { getRxStorageExpoAsync } from 'rxdb-premium/plugins/storage-filesystem-expo';

import { withTargetedOpfsRecovery } from '../../plugins/opfs-targeted-recovery.mjs';
import {
	STORAGE_TIMING_PROBE_ENABLED,
	withStorageTimingProbe,
} from '../../plugins/storage-timing-probe';

export function getNativeNewStorage() {
	const rawStorage = getRxStorageExpoAsync();
	return withTargetedOpfsRecovery(
		STORAGE_TIMING_PROBE_ENABLED ? withStorageTimingProbe(rawStorage, 'raw') : rawStorage
	);
}
