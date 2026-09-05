import { Paths } from 'expo-file-system';
import { installWorkletFs } from 'react-native-worklet-fs';
import { createWorkletRuntime, scheduleOnRuntime } from 'react-native-worklets';
import { getRxStorageWorklet, receiveWorkletMessage } from 'rxdb-storage-worklet';

import { exposeStorage } from './worklet-worker';

// A lost initialization callback must not leave the POS opening indefinitely.
const INITIALIZATION_TIMEOUT_MS = 10_000;
let initialized: Promise<ReturnType<typeof getRxStorageWorklet>> | undefined;

export function workletRootDirectory(documentUri: string): string {
	return `${documentUri.replace(/^file:\/\//, '').replace(/\/+$/, '')}/.worklet-opfs`;
}

export function createWorkletStorage() {
	return (initialized ??= new Promise<ReturnType<typeof createWorkletRuntime>>(
		(resolve, reject) => {
			const timer = setTimeout(
				() => ready('no worker response within 10 seconds'),
				INITIALIZATION_TIMEOUT_MS
			);
			function ready(error?: string) {
				clearTimeout(timer);
				if (error !== undefined)
					reject(new Error(`WCPOS worklet storage initialization failed: ${error}`));
				else resolve(runtime);
			}
			let runtime: ReturnType<typeof createWorkletRuntime>;
			try {
				runtime = createWorkletRuntime({ name: 'rxdb-storage' });
				installWorkletFs(runtime);
				scheduleOnRuntime(
					runtime,
					exposeStorage,
					workletRootDirectory(Paths.document.uri),
					ready,
					receiveWorkletMessage
				);
			} catch (error) {
				ready(String(error));
			}
		}
	).then((runtime) => getRxStorageWorklet({ runtime, identifier: 'wcpos' })));
}
