import { getRxStorageIndexedDB } from 'rxdb-premium/plugins/storage-indexeddb';
import { exposeWorkerRxStorage } from 'rxdb-premium/plugins/storage-worker';
exposeWorkerRxStorage({ storage: getRxStorageIndexedDB() });
