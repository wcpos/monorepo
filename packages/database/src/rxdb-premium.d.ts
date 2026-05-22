declare module 'rxdb-premium/plugins/flexsearch' {
	export const RxDBFlexSearchPlugin: import('rxdb').RxPlugin;

	export function addFulltextSearch(options: {
		identifier: string;
		collection: import('rxdb').RxCollection;
		docToString(doc: any): string;
		initialization?: 'async' | 'lazy' | 'sync';
		indexOptions?: Record<string, unknown>;
	}): Promise<unknown>;
}

declare module 'rxdb-premium/plugins/shared' {
	export function disableVersionCheck(): void;
	export function setPremiumFlag(): void;
}

declare module 'rxdb-premium/plugins/storage-memory-mapped' {
	export function getMemoryMappedRxStorage<
		Internals = any,
		InstanceCreationOptions = any,
	>(settings: {
		storage: import('rxdb').RxStorage<Internals, InstanceCreationOptions> | any;
		[key: string]: unknown;
	}): import('rxdb').RxStorage<Internals, InstanceCreationOptions>;
}

declare module 'rxdb-premium/plugins/storage-sqlite' {
	export * from 'rxdb/plugins/storage-sqlite';

	export type RxStorageSQLite = import('rxdb').RxStorage<
		any,
		import('rxdb/plugins/storage-sqlite').SQLiteInstanceCreationOptions
	> & {
		settings: import('rxdb/plugins/storage-sqlite').SQLiteStorageSettings;
	};

	export function getRxStorageSQLite(
		settings: import('rxdb/plugins/storage-sqlite').SQLiteStorageSettings
	): RxStorageSQLite;
}

declare module 'rxdb-premium/plugins/storage-worker' {
	type WorkerInput = string | (() => Worker);

	export function getRxStorageWorker(options: {
		mode?: 'storage' | 'database' | 'collection' | 'one';
		workerInput: WorkerInput;
		workerOptions?: WorkerOptions;
	}): import('rxdb').RxStorage<any, any>;
}

declare module 'rxdb-premium-old/plugins/storage-sqlite' {
	export * from 'rxdb-old/plugins/storage-sqlite';

	export type RxStorageSQLite = {
		name: string;
		settings: import('rxdb-old/plugins/storage-sqlite').SQLiteStorageSettings;
		createStorageInstance<RxDocType>(
			params: import('rxdb/plugins/core').RxStorageInstanceCreationParams<
				RxDocType,
				import('rxdb-old/plugins/storage-sqlite').SQLiteInstanceCreationOptions
			>
		): Promise<any>;
	};

	export function createSQLiteStorageInstance<RxDocType>(
		storage: RxStorageSQLite,
		params: import('rxdb/plugins/core').RxStorageInstanceCreationParams<
			RxDocType,
			import('rxdb-old/plugins/storage-sqlite').SQLiteInstanceCreationOptions
		>,
		settings: import('rxdb-old/plugins/storage-sqlite').SQLiteStorageSettings
	): Promise<any>;

	export function getRxStorageSQLite(
		settings: import('rxdb-old/plugins/storage-sqlite').SQLiteStorageSettings
	): RxStorageSQLite;
}
