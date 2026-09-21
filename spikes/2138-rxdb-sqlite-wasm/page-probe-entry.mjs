// Page-side probe: drive premium's worker storage against the spike worker without karma.
import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';
import { fillWithDefaultSettings, randomToken, now } from 'rxdb/plugins/core';

const log = (...a) => console.log('[probe]', ...a);
const withTimeout = (label, p, ms = 8000) =>
	Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label + ' timed out after ' + ms + 'ms')), ms))]);

globalThis.runProbe = async () => {
	const storage = getRxStorageWorker({
		workerInput: '/files/spike-2138/sqlite-worker.js',
		workerOptions: { type: 'module' },
	});
	log('storage name', storage.name);
	const schema = fillWithDefaultSettings({
		version: 0,
		primaryKey: 'id',
		type: 'object',
		properties: { id: { type: 'string', maxLength: 100 }, n: { type: 'number' } },
		required: ['id', 'n'],
	});
	const instance = await withTimeout('createStorageInstance', storage.createStorageInstance({
		databaseInstanceToken: randomToken(10),
		databaseName: 'probe-' + randomToken(6),
		collectionName: 'docs',
		schema,
		options: {},
		multiInstance: false,
		devMode: true,
	}));
	log('instance created');
	const res = await withTimeout('bulkWrite', instance.bulkWrite([
		{ document: { id: 'a', n: 1, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: Date.now() } } },
	], 'probe'));
	log('bulkWrite errors', JSON.stringify(res.error));
	const found = await withTimeout('findDocumentsById', instance.findDocumentsById(['a'], false));
	log('found', JSON.stringify(found).slice(0, 200));
	// Cleanup timing probe: push rxdb's now() ahead of Date.now() the way a fast test
	// suite does (every 99 calls inside one ms advance it by 1 ms), then delete,
	// cleanup(0) at once, and again after a pause.
	for (let i = 0; i < 5000; i++) now();
	log('now() minus Date.now() (ms):', (now() - Date.now()).toFixed(2));
	const del = await instance.bulkWrite([
		{ previous: found[0], document: { ...found[0], _deleted: true, _rev: '2-a', _meta: { lwt: now() } } },
	], 'probe');
	log('delete errors', JSON.stringify(del.error));
	await instance.cleanup(0);
	log('remaining right after cleanup(0):', (await instance.findDocumentsById(['a'], true)).length);
	await new Promise((r) => setTimeout(r, 20));
	await instance.cleanup(0);
	log('remaining after 20ms + cleanup(0):', (await instance.findDocumentsById(['a'], true)).length);
	await withTimeout('close', instance.close());
	log('closed');
	return 'ok';
};
