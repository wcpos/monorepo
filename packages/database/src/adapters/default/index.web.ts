import { addRxPlugin } from 'rxdb';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import {
	createRepairOwnershipPlugin,
	getRepairOwnershipChannelName,
} from '../../plugins/repair-ownership';
import { getWebNewStorage } from '../storage/index.web';
import { wrappedErrorHandlerStorage } from '../../plugins/wrapped-error-handler-storage';

const workerStorage = getWebNewStorage();
addRxPlugin(createRepairOwnershipPlugin({ channelName: getRepairOwnershipChannelName() }));

// Always wrap with error handler (catches/logs raw RxDB errors before they reach UI)
export const storage = wrappedErrorHandlerStorage({ storage: workerStorage });

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const defaultConfig = {
	storage: __DEV__ ? devStorage : storage,
	// RULING (2026-08-06, monorepo #1057, closes #1045/#1055): web multi-tab of one
	// store is first-class. One tab holds the write lease (navigator.locks); `true`
	// gives the others a coherent read view over BroadcastChannel and lets RxDB's
	// leader election run cleanup/recovery in exactly one tab. `false` here lets two
	// tabs each repair the same OPFS file — a proven data-loss path (#1049). Do not
	// flip this; if recovery refuses on web, fix the gate, not the flag.
	// See the Decision section of ./README.md.
	multiInstance: true,
	ignoreDuplicate: !!__DEV__,
};
