import { exposeWorkerRxStorage } from "rxdb-premium/plugins/storage-worker";
import { getRxStorageOPFS } from "rxdb-premium/plugins/storage-opfs";

import { withTargetedOpfsRecovery } from "./opfs-targeted-recovery.mjs";

exposeWorkerRxStorage({
  storage: withTargetedOpfsRecovery(getRxStorageOPFS()),
});
