import { getRxStorageOPFS } from 'rxdb-premium/plugins/storage-opfs';
import { exposeWorkerRxStorage } from 'rxdb-premium/plugins/storage-worker';

import { createRepairOwnership } from './opfs-repair-ownership.mjs';
import { withTargetedOpfsRecovery } from './opfs-targeted-recovery.mjs';

const ownership = createRepairOwnership({
	channelName: typeof self !== 'undefined' ? self.name : '',
});
exposeWorkerRxStorage({
	storage: withTargetedOpfsRecovery(getRxStorageOPFS(), {
		ownsRepairs: ownership.ownsRepairs,
		onInstance: ownership.onInstance,
	}),
});
