declare module 'uniwind' {
	export function useCSSVariable(variable: string): string | number | undefined;
	export function useCSSVariable(variables: readonly string[]): Array<string | number | undefined>;

	export function useUniwind(): {
		theme: string;
		hasAdaptiveThemes: boolean;
	};

	export const Uniwind: {
		setTheme: (theme: string) => void;
	};

	export function withUniwind<T>(component: T): T;
}

declare module 'rxdb-premium/plugins/flexsearch' {
	export const RxDBFlexSearchPlugin: any;
	export function addFulltextSearch(options: any): Promise<any>;
}

declare module 'rxdb-premium/plugins/shared' {
	export function disableVersionCheck(): void;
	export function setPremiumFlag(): void;
}

declare module 'rxdb-premium/plugins/storage-memory-mapped' {
	export function getMemoryMappedRxStorage(options?: any): any;
}

declare module 'rxdb-premium/plugins/storage-sqlite' {
	export function getRxStorageSQLite(settings: any): any;
}

declare module 'rxdb-premium/plugins/storage-worker' {
	export function getRxStorageWorker(options: any): any;
}

declare module 'rxdb-premium-old/plugins/storage-sqlite' {
	export interface SQLiteQueryWithParams {
		query: string;
		params?: unknown[];
	}

	export type SQLResultRow = Record<string, unknown>;

	export interface SQLiteBasics<Database> {
		open(databaseName: string): Promise<Database>;
		all(db: Database, queryObject: SQLiteQueryWithParams): Promise<SQLResultRow[]>;
		run(db: Database, queryObject: SQLiteQueryWithParams): Promise<unknown>;
		setPragma(
			db: Database,
			pragmaKey: string,
			pragmaValue: string | number | boolean
		): Promise<unknown>;
		close(db: Database): Promise<void>;
		journalMode?: string;
	}

	export interface SQLiteStorageSettings {
		sqliteBasics: SQLiteBasics<any>;
		[key: string]: unknown;
	}

	export interface SQLiteInstanceCreationOptions {
		[key: string]: unknown;
	}

	export interface RxStorageSQLite {
		settings: SQLiteStorageSettings;
		createStorageInstance: <RxDocType>(params: any) => Promise<any>;
		[key: string]: any;
	}

	export function getRxStorageSQLite(settings: SQLiteStorageSettings): RxStorageSQLite;
	export function createSQLiteStorageInstance(
		storage: RxStorageSQLite,
		params: any,
		settings: SQLiteStorageSettings
	): Promise<any>;
}
