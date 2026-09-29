import { SQLITE_POOL_DIRECTORY } from './adapters/storage/sqlite-pool';
import { measureAppStorage } from './measure-storage.web';

const file = (size: number) => ({ kind: 'file', getFile: async () => ({ size }) });
const directory = (children: Record<string, unknown>) => ({
	kind: 'directory',
	async *entries() {
		yield* Object.entries(children);
	},
	async *values() {
		yield* Object.values(children);
	},
});
it('measures opaque SQLite pool recursively and labels filesystem entries legacy', async () => {
	const root = directory({
		[SQLITE_POOL_DIRECTORY]: directory({ '.opaque': directory({ a: file(100), b: file(23) }) }),
		'rxdb-store_v6_shop-logs-0': directory({ 'documents.json': file(10) }),
		unrelated: directory({ file: file(900) }),
	});
	Object.defineProperty(globalThis, 'navigator', {
		configurable: true,
		value: {
			storage: {
				getDirectory: async () => root,
				estimate: async () => ({ usage: 1033 }),
			},
		},
	});
	const result = await measureAppStorage();
	expect(result?.entries).toEqual([
		{ name: SQLITE_POOL_DIRECTORY, root: 'sqlite', bytes: 123 },
		{ name: 'rxdb-store_v6_shop-logs-0', bytes: 10, legacy: true },
	]);
});
