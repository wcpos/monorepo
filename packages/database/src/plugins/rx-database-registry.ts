import type { RxDatabaseBase, RxPlugin } from 'rxdb';
type RegisteredDatabase = Pick<RxDatabaseBase<unknown, unknown>, 'name' | 'onClosed'>;
type MutableOnClosed = { onClosed: (() => void) | undefined };
const openDatabasesByName = new Map<string, Set<RegisteredDatabase>>();
export const rxDatabaseRegistryPlugin: RxPlugin = {
	name: 'rx-database-registry',
	rxdb: true,
	prototypes: {},
	overwritable: {},
	hooks: {
		createRxDatabase: {
			after: ({ database }) => {
				let databases = openDatabasesByName.get(database.name);
				if (!databases) {
					databases = new Set();
					openDatabasesByName.set(database.name, databases);
				}
				databases.add(database);

				const originalOnClosed = database.onClosed;
				// Deliberate rxdb-17.4.0 internals reach, version-pinned by the registry test.
				const mutableDatabase = database as unknown as MutableOnClosed;
				mutableDatabase.onClosed = () => {
					const registered = openDatabasesByName.get(database.name);
					registered?.delete(database);
					if (registered?.size === 0) openDatabasesByName.delete(database.name);
					originalOnClosed?.();
				};
			},
		},
	},
};

export function forceFreeDatabaseRegistration(databaseName: string): boolean {
	const databases = openDatabasesByName.get(databaseName);
	if (!databases) return false;
	let freed = false;
	for (const database of [...databases]) {
		const mutableDatabase = database as unknown as MutableOnClosed;
		const onClosed = mutableDatabase.onClosed;
		// Neuter first: a wedged close settling later must not free a new owner's registration.
		mutableDatabase.onClosed = undefined;
		onClosed?.();
		freed = true;
	}
	return freed;
}
