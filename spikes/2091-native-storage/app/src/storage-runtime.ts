import {
	createWorkletRuntime,
	scheduleOnRN,
	scheduleOnRuntime,
	type WorkletRuntime,
} from 'react-native-worklets';
import { getRxStorageAbstractFilesystem } from 'rxdb-premium/plugins/storage-abstract-filesystem';

import {
	exposeWorkletRxStorage,
	getRxStorageWorklet,
	receiveWorkletMessage,
} from '@wcpos/rxdb-storage-worklet';
import { getWorkletFs, installWorkletFs } from '@wcpos/react-native-worklet-fs';
import {
	createAbstractFilesystemAdapter,
	createPromiseQueueLock,
	createWorkletOpfs,
	installWorkletRuntimePolyfills,
} from '@wcpos/worklet-opfs';
// Same construction as example/src/storage-runtime.ts; only the per-job root is parameterized.
function receiveLog(message: string) {
	console.info(message);
}
function exposeStorage(
	rootDirectory: string,
	receiveGlobalName: string,
	ready: (error?: string) => void,
	receiveOnRN: typeof receiveWorkletMessage,
	logOnRN: typeof receiveLog
): void {
	'worklet';
	try {
		installWorkletRuntimePolyfills({ fs: getWorkletFs() });
		// Reopen evidence lives on this runtime too; forward it to the RN capture, not a log scraper.
		for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'assert'] as const)
			console[method] = (...values: unknown[]) =>
				scheduleOnRN(
					logOnRN,
					values.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ')
				);
		const globals = globalThis as unknown as Record<string, unknown>;
		for (const hook of [
			'__wcposOnStorageRecovery',
			'__wcposOnIndexRebuild',
			'__wcposOnStorageRunFailure',
		])
			globals[hook] = (event: unknown) =>
				scheduleOnRN(logOnRN, `recovery ${hook}: ${JSON.stringify(event)}`);
		const storage = getRxStorageAbstractFilesystem({
			name: 'worklet-filesystem',
			abstractFilesystem: createAbstractFilesystemAdapter(createWorkletOpfs({ rootDirectory })),
			abstractLock: createPromiseQueueLock(),
			inWorker: true,
			settings: { decoder: { decode: (data) => new TextDecoder().decode(data) } },
		});
		void exposeWorkletRxStorage({ storage, receiveGlobalName, scheduleOnRN, receiveOnRN }).then(
			() => scheduleOnRN(ready),
			(error) => scheduleOnRN(ready, String(error))
		);
	} catch (error) {
		scheduleOnRN(ready, String(error));
	}
}
export async function createWorkletStorage(rootDirectory: string) {
	const runtime = createWorkletRuntime({ name: 'rxdb-filesystem' });
	installWorkletFs(runtime);
	const identifier = `filesystem-${Date.now()}`,
		receiveGlobalName = `__rxdbReceiveString_${identifier}`;
	await new Promise<void>((resolve, reject) =>
		scheduleOnRuntime(
			runtime,
			exposeStorage,
			rootDirectory,
			receiveGlobalName,
			(error?: string) => (error ? reject(new Error(error)) : resolve()),
			receiveWorkletMessage,
			receiveLog
		)
	);
	return getRxStorageWorklet({
		runtime,
		identifier,
		receiveGlobalName,
		scheduleOnRuntime: (target, task, ...args) =>
			scheduleOnRuntime(target as WorkletRuntime, task, ...args),
		scheduleOnRN,
	});
}
