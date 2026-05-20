declare module 'rxdb-premium/plugins/flexsearch' {
	export const RxDBFlexSearchPlugin: import('rxdb').RxPlugin;
	export function addFulltextSearch(options: {
		identifier: string;
		collection: import('rxdb').RxCollection;
		docToString: (doc: any) => string;
		initialization?: 'lazy' | 'instant';
		indexOptions?: Record<string, unknown>;
	}): Promise<import('./types').FlexSearchInstance>;
}

declare module 'rxdb-premium/plugins/shared' {
	export function disableVersionCheck(): void;
	export function setPremiumFlag(): void;
}

declare module 'rxdb-premium/plugins/storage-memory-mapped' {
	export function getMemoryMappedRxStorage(options: Record<string, unknown>): any;
}

declare module 'rxdb-premium/plugins/storage-worker' {
	export function getRxStorageWorker(options: Record<string, unknown>): any;
}

declare module 'rxdb-premium/plugins/storage-sqlite' {
	export interface SQLiteQueryWithParams {
		query: string;
		params?: unknown[];
	}

	export type SQLResultRow = Record<string, unknown>;

	export interface SQLiteBasics<T = any> {
		open(databaseName: string): Promise<T>;
		all(db: T, queryObject: SQLiteQueryWithParams): Promise<SQLResultRow[]>;
		run(db: T, queryObject: SQLiteQueryWithParams): Promise<unknown>;
		setPragma(db: T, pragmaKey: string, pragmaValue: string): Promise<unknown>;
		close(db: T): Promise<unknown>;
		journalMode?: string;
	}

	export type SQLiteStorageSettings = Record<string, unknown>;
	export type SQLiteInstanceCreationOptions = Record<string, unknown>;
	export type RxStorageSQLite = any;

	export function getRxStorageSQLite(settings: SQLiteStorageSettings): RxStorageSQLite;
	export function createSQLiteStorageInstance(...args: any[]): Promise<any>;
}

declare module 'rxdb-premium-old/plugins/storage-sqlite' {
	export interface SQLiteQueryWithParams {
		query: string;
		params?: unknown[];
	}

	export type SQLResultRow = Record<string, unknown>;

	export interface SQLiteBasics<T = any> {
		open(databaseName: string): Promise<T>;
		all(db: T, queryObject: SQLiteQueryWithParams): Promise<SQLResultRow[]>;
		run(db: T, queryObject: SQLiteQueryWithParams): Promise<unknown>;
		setPragma(db: T, pragmaKey: string, pragmaValue: string): Promise<unknown>;
		close(db: T): Promise<unknown>;
		journalMode?: string;
	}

	export type SQLiteStorageSettings = Record<string, unknown>;
	export type SQLiteInstanceCreationOptions = Record<string, unknown>;
	export type RxStorageSQLite = any;

	export function getRxStorageSQLite(settings: SQLiteStorageSettings): RxStorageSQLite;
	export function createSQLiteStorageInstance(...args: any[]): Promise<any>;
}
