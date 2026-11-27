import type { RxStorage, RxStorageInstance, RxStorageInstanceCreationParams } from 'rxdb';
// Bundle-time gate, inlined by Expo like EXPO_PUBLIC_WCPOS_E2E: in a release bundle this folds to
// `false` and the storage chain is untouched on every platform. Measurement builds opt in on the
// Expo command that produces the bundle:
//   native   (apps/main)     EXPO_PUBLIC_WCPOS_STORAGE_PROBE=1 npx expo start --no-dev --minify --clear
//   web      (apps/main)     EXPO_PUBLIC_WCPOS_STORAGE_PROBE=1 npx expo start --web --no-dev --minify --clear
//   electron (monorepo root) EXPO_PUBLIC_WCPOS_STORAGE_PROBE=1 pnpm dev:electron-renderer, then
//            `pnpm dev` in wcpos/electron; a packaged build takes the flag on `pnpm build:electron`.
// The report is one logger row a minute (['wcpos','storage','timing']) in the app's Logs screen.
export const STORAGE_TIMING_PROBE_ENABLED = process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE === '1';
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
// One logcat line per raw call that took at least this long from enqueue to settle: well under the
// 1.5 s fast-add total, and far above a normal write.
export const STORAGE_WAIT_TRACE_MS = 250;
// Logcat prefix of a FIFO trace line; grep it in the native E2E artifacts.
export const STORAGE_WAIT_PREFIX = 'WCPOS_E2E_STORAGE_WAIT ';
// Ahead writes listed per line; aheadMore and aheadByCollection still count all of them.
export const STORAGE_WAIT_AHEAD_LIMIT = 10;
interface TraceRecord {
	seq: number;
	collection: string;
	rows: number;
	ctx: string | null;
	enqueuedAt: number;
	endedAt?: number;
}
let traceSeq = 0;
const databaseOrdinals = new Map<string, number>();
const inFlightByDatabase = new Map<string, TraceRecord[]>();
// Raw-layer FIFO trace (probe bundles only). Date.now(), never performance.now(): epoch times line
// up with ledger lines. Logs collection names, rxdb context strings, counts and timings only.
function traceStorageInstance<RxDocType, Internals, InstanceCreationOptions>(
	instance: RxStorageInstance<RxDocType, Internals, InstanceCreationOptions>,
	collection: string,
	databaseName: string
): void {
	const db = databaseOrdinals.get(databaseName) ?? databaseOrdinals.size + 1;
	databaseOrdinals.set(databaseName, db);
	const inFlight = inFlightByDatabase.get(databaseName) ?? [];
	inFlightByDatabase.set(databaseName, inFlight);
	// Returns the settle callback; neither half can throw into storage.
	const begin = (op: StorageTimingMethod, args: unknown[]) => {
		try {
			const enqueuedAt = Date.now();
			const isWrite = op === 'bulkWrite';
			const ctx = isWrite ? String(args[1]).slice(0, 64) : null;
			const rows = op === 'count' ? 1 : op === 'query' ? 0 : (args[0] as unknown[]).length;
			const record: TraceRecord = { seq: ++traceSeq, collection, rows, ctx, enqueuedAt };
			const ahead = [...inFlight];
			if (isWrite) inFlight.push(record);
			return (result?: unknown) => {
				try {
					const endedAt = (record.endedAt = Date.now());
					if (isWrite) inFlight.splice(inFlight.indexOf(record), 1);
					const totalMs = endedAt - enqueuedAt;
					if (totalMs < STORAGE_WAIT_TRACE_MS) return;
					const startedAt = Math.max(enqueuedAt, ...ahead.map((a) => a.endedAt ?? 0));
					const aheadByCollection: Record<string, [number, number]> = {};
					for (const a of ahead) {
						const [n, r] = aheadByCollection[a.collection] ?? [0, 0];
						aheadByCollection[a.collection] = [n + 1, r + a.rows];
					}
					const listed = ahead.slice(0, STORAGE_WAIT_AHEAD_LIMIT);
					const line = `${STORAGE_WAIT_PREFIX}${JSON.stringify({
						db,
						seq: record.seq,
						op,
						collection,
						rows: (result as { documents?: unknown[] })?.documents?.length ?? rows,
						ctx,
						enqueuedAt,
						waitMs: isWrite ? startedAt - enqueuedAt : null,
						runMs: isWrite ? endedAt - startedAt : null,
						totalMs,
						aheadCount: ahead.length,
						ahead: listed.map((a) => ({ ...a, endedAt: a.endedAt ?? null })),
						aheadMore: ahead.length - listed.length,
						aheadByCollection,
					})}`;
					const hook: unknown = Reflect.get(globalThis, 'nativeLoggingHook');
					if (typeof hook === 'function') hook(line, 1);
					else console.warn(line);
				} catch {
					// Diagnostics only: the trace never changes a result or an error.
				}
			};
		} catch {
			return () => undefined;
		}
	};
	for (const op of ['bulkWrite', 'query', 'findDocumentsById', 'count'] as const) {
		const call = instance[op].bind(instance) as (...args: unknown[]) => Promise<unknown>;
		Reflect.set(instance, op, (...args: unknown[]) => {
			const end = begin(op, args);
			const settled = call(...args);
			// A side chain: the caller gets the original promise, result and error untouched.
			void settled.then(end, () => end());
			return settled;
		});
	}
}
function wrapStorageInstance<RxDocType, Internals, InstanceCreationOptions>(
	instance: RxStorageInstance<RxDocType, Internals, InstanceCreationOptions>,
	layer: StorageTimingLayer,
	collectionName: string,
	databaseName: string
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
	if (layer === 'raw') traceStorageInstance(instance, collectionName, databaseName);
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
			wrapStorageInstance(instance, layer, params.collectionName, params.databaseName);
			return instance;
		},
	};
}
export function takeStorageTimingSnapshot(): StorageTimingEntry[] {
	const snapshot = [...storageTimings.values()].sort((a, b) => b.totalMs - a.totalMs);
	storageTimings.clear();
	return snapshot;
}
