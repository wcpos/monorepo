import { scheduleOnRN } from 'react-native-worklets';
import { getRxStorageAbstractFilesystem } from 'rxdb-premium/plugins/storage-abstract-filesystem';

import { getWorkletFs } from '@wcpos/react-native-worklet-fs';
import { exposeWorkletRxStorage, type receiveWorkletMessage } from '@wcpos/rxdb-storage-worklet';
import {
	createAbstractFilesystemAdapter,
	createPromiseQueueLock,
	createWorkletOpfs,
	installWorkletRuntimePolyfills,
} from '@wcpos/worklet-opfs';

import { withTargetedOpfsRecovery } from '../../plugins/opfs-targeted-recovery.mjs';

export function exposeStorage(
	rootDirectory: string,
	ready: (error?: string) => void,
	receiveOnRN: typeof receiveWorkletMessage
): void {
	'worklet';
	try {
		installWorkletRuntimePolyfills({ fs: getWorkletFs() });
		const storage = withTargetedOpfsRecovery(
			getRxStorageAbstractFilesystem({
				name: 'wcpos-worklet-filesystem',
				abstractFilesystem: createAbstractFilesystemAdapter(createWorkletOpfs({ rootDirectory })),
				abstractLock: createPromiseQueueLock(),
				inWorker: true,
				settings: { decoder: { decode: (data) => new TextDecoder().decode(data) } },
			})
		);
		void exposeWorkletRxStorage({ storage, identifier: 'wcpos', receiveOnRN, scheduleOnRN }).then(
			() => scheduleOnRN(ready),
			(error: unknown) => scheduleOnRN(ready, String(error))
		);
	} catch (error) {
		scheduleOnRN(ready, String(error));
	}
}
