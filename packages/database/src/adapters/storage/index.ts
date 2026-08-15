import { getRxStorageExpoAsync } from 'rxdb-premium/plugins/storage-filesystem-expo';

import { withTargetedOpfsRecovery } from '../../plugins/opfs-targeted-recovery.mjs';

export function getNativeNewStorage() {
	return withTargetedOpfsRecovery(getRxStorageExpoAsync());
}
