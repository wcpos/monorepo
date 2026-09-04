import type { RxStorage, RxStorageInstance, RxStorageInstanceCreationParams } from 'rxdb';
export const STORAGE_TIMING_PROBE_ENABLED = true; // Measurement build for the September 2026 native JS-thread investigation; set to false before release.
export const STORAGE_SLOW_CALL_MS = 16; // One 60 Hz frame.
const STORAGE_SLOW_SAMPLE_LIMIT = 5; // Keeps recent outliers without making each log row noisy.
type StorageTimingLayer = 'raw' | 'wrapped';
type StorageTimingMethod = 'bulkWrite' | 'query' | 'findDocumentsById' | 'count';
export interface StorageTimingEntry {
	layer: StorageTimingLayer;
	collectionName: string;
	method: StorageTimingMethod;
	calls: number;
	totalMs: number;
	maxMs: number;
	rows: number;
	slow: { ms: number; rows: number }[];
}
const storageTimings = new Map<string, StorageTimingEntry>();
function recordStorageTiming(
	layer: StorageTimingLayer,
	collectionName: string,
	method: StorageTimingMethod,
	ms: number,
	rows: number
): void {
	const key = `${layer}:${collectionName}:${method}`;
	const entry = storageTimings.get(key) ?? {
		layer,
		collectionName,
		method,
		calls: 0,
		totalMs: 0,
		maxMs: 0,
		rows: 0,
		slow: [],
	};
	entry.calls += 1;
	entry.totalMs += ms;
	entry.maxMs = Math.max(entry.maxMs, ms);
	entry.rows += rows;
	if (ms > STORAGE_SLOW_CALL_MS) {
		entry.slow.push({ ms, rows });
		entry.slow = entry.slow.slice(-STORAGE_SLOW_SAMPLE_LIMIT);
	}
	storageTimings.set(key, entry);
}
async function measureStorageCall<Result>(
	layer: StorageTimingLayer,
	collectionName: string,
	method: StorageTimingMethod,
	rows: number | (() => number),
	call: () => Promise<Result>
): Promise<Result> {
	const startedAt = performance.now();
	try {
		return await call();
	} finally {
		recordStorageTiming(
			layer,
			collectionName,
			method,
			performance.now() - startedAt,
			typeof rows === 'number' ? rows : rows()
		);
	}
}
function wrapStorageInstance<RxDocType, Internals, InstanceCreationOptions>(
	instance: RxStorageInstance<RxDocType, Internals, InstanceCreationOptions>,
	layer: StorageTimingLayer,
	collectionName: string
): void {
	const measure = <Result>(
		method: StorageTimingMethod,
		rows: number | (() => number),
		call: () => Promise<Result>
	) => measureStorageCall(layer, collectionName, method, rows, call);
	const bulkWrite = instance.bulkWrite.bind(instance);
	instance.bulkWrite = (documentWrites, context) =>
		measure('bulkWrite', documentWrites.length, () => bulkWrite(documentWrites, context));
	const query = instance.query.bind(instance);
	instance.query = (preparedQuery) => {
		let rows = 0;
		return measure(
			'query',
			() => rows,
			async () => {
				const result = await query(preparedQuery);
				rows = result.documents.length;
				return result;
			}
		);
	};
	const findDocumentsById = instance.findDocumentsById.bind(instance);
	instance.findDocumentsById = (ids, withDeleted) =>
		measure('findDocumentsById', ids.length, () => findDocumentsById(ids, withDeleted));
	const count = instance.count.bind(instance);
	instance.count = (preparedQuery) => measure('count', 1, () => count(preparedQuery));
}
export function withStorageTimingProbe<Internals, InstanceCreationOptions>(
	storage: RxStorage<Internals, InstanceCreationOptions>,
	layer: StorageTimingLayer
): RxStorage<Internals, InstanceCreationOptions> {
	const createStorageInstance = storage.createStorageInstance.bind(storage);
	return {
		...storage,
		async createStorageInstance<RxDocType>(
			params: RxStorageInstanceCreationParams<RxDocType, InstanceCreationOptions>
		) {
			const instance = await createStorageInstance(params);
			wrapStorageInstance(instance, layer, params.collectionName);
			return instance;
		},
	};
}
export function takeStorageTimingSnapshot(): StorageTimingEntry[] {
	const snapshot = [...storageTimings.values()].sort((a, b) => b.totalMs - a.totalMs);
	storageTimings.clear();
	return snapshot;
}
