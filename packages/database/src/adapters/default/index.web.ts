import { addRxPlugin } from 'rxdb';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import {
	createRepairOwnershipPlugin,
	getRepairOwnershipChannelName,
} from '../../plugins/repair-ownership';
import { getWebNewStorage } from '../storage/index.web';
import {
	STORAGE_TIMING_PROBE_ENABLED,
	withStorageTimingProbe,
} from '../../plugins/storage-timing-probe';
import { wrappedErrorHandlerStorage } from '../../plugins/wrapped-error-handler-storage';

const workerStorage = getWebNewStorage();
addRxPlugin(createRepairOwnershipPlugin({ channelName: getRepairOwnershipChannelName() }));

// Always wrap with error handler (catches/logs raw RxDB errors before they reach UI)
const errorHandlerStorage = wrappedErrorHandlerStorage({ storage: workerStorage });
export const storage = STORAGE_TIMING_PROBE_ENABLED
	? withStorageTimingProbe(errorHandlerStorage, 'wrapped')
	: errorHandlerStorage;

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const defaultConfig = {
	storage: __DEV__ ? devStorage : storage,
	// A CONSEQUENCE of the storage engine, not a preference — pinned as a pair by
	// ./multi-instance-ruling.test.ts against
	// `../storage/storage-engines.ts`.
	//
	// On today's `opfs-filesystem` engine this is `true` BY RULING (2026-08-06,
	// #1057, closes #1045/#1055): every tab opens its own storage over the same
	// files, so `true` is what gives the others a coherent read view over
	// BroadcastChannel and lets RxDB's leader election run cleanup/recovery in
	// exactly one tab. `false` here lets two tabs each repair the same OPFS file —
	// a proven data-loss path (#1049). If recovery refuses on web, fix the gate,
	// not the flag.
	//
	// It becomes `false` when — and only when — the engine becomes
	// `sqlite-sahpool` (2.0, #2146), whose pool VFS holds exclusive OPFS handles
	// for the origin so a second tab never opens storage at all. Flipping it
	// before the engine moves reintroduces #1049.
	//
	// See the Decision section of ./README.md.
	multiInstance: true,
	ignoreDuplicate: !!__DEV__,
};
