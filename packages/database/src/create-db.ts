import { createRxDatabase, removeRxDatabase } from 'rxdb';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { defaultConfig } from './adapters/default';
import { ephemeralStorageConfig } from './adapters/ephemeral';
import { fastStorageConfig } from './adapters/fast';
import {
	StoreCollections,
	storeCollections,
	SyncCollections,
	syncCollections,
	TemporaryCollections,
	temporaryCollections,
	UserCollections,
	userCollections,
} from './collections';
import {
	getFastStoreDatabaseNames,
	getStoreDatabaseNames,
	getUserDatabaseNames,
} from './migration/storage/database-names';
import { getMigrationLocalDocId } from './migration/storage/migration-local-doc-id';

import type {
	StorageMigrationDatabase,
	StorageMigrationDatabaseKind,
	StorageMigrationStatus,
} from './migration/storage/types';

const dbLogger = getLogger(['wcpos', 'db', 'create']);

/**
 * Lazy-loads and runs the storage migration pipeline.
 *
 * All rxdb-old / migration-storage imports are deferred to dynamic import()
 * so they are code-split out of the initial bundle. They are only fetched
 * when a migration actually needs to run (i.e. first launch after upgrade).
 */
const runPersistentStorageMigration = async (
	databaseKind: StorageMigrationDatabaseKind,
	database: StorageMigrationDatabase,
	oldDatabaseName: string,
	collections?: Record<string, any>
) => {
	const [
		{ getStorageMigrationConfig, prepareOldDatabaseForStorageMigration },
		{ runStorageMigration },
		{ verifyStorageMigration },
	] = await Promise.all([
		import('./migration/storage'),
		import('./migration/storage/run-storage-migration'),
		import('./migration/storage/verify-migration'),
	]);

	const { oldStorage, sourceStorage, targetStorage } = getStorageMigrationConfig(databaseKind);

	await verifyStorageMigration({
		database,
		oldDatabaseName,
		sourceStorage,
		targetStorage,
	});

	await runStorageMigration({
		database,
		oldDatabaseName,
		oldStorage: oldStorage as any,
		sourceStorage,
		targetStorage,
		prepareOldDatabase: collections
			? () =>
					prepareOldDatabaseForStorageMigration({
						oldDatabaseName,
						oldStorage,
						collections: collections as Record<string, any>,
					})
			: undefined,
	});
};

const getMigrationMarkerData = (marker: any) => {
	if (!marker) {
		return undefined;
	}

	if (marker.data) {
		return marker.data;
	}

	if (typeof marker.toJSON === 'function') {
		const json = marker.toJSON();
		return json?.data ?? json;
	}

	return marker;
};

const getMigrationMarkerStatus = (marker: any): StorageMigrationStatus | undefined =>
	getMigrationMarkerData(marker)?.status;

type PersistentDatabaseConfig = {
	storage: unknown;
	multiInstance?: boolean;
};

type PersistentDatabase = StorageMigrationDatabase & {
	close: () => Promise<boolean>;
	addCollections: (...args: any[]) => Promise<any>;
};

/**
 * If a previous storage migration failed, destroy the partially-migrated target
 * database and recreate it from scratch. This intentionally causes data loss in
 * the new database — the assumption is that the old database still contains the
 * authoritative copy and migration will be retried on the next launch.
 *
 * If the old database has already been cleaned up (migration was partially
 * successful), data for this database is unrecoverable and will be re-synced
 * from the server on next login.
 */
const resetFailedMigrationTargetIfNeeded = async <T extends PersistentDatabase>({
	database,
	name,
	config,
	recreate,
}: {
	database: T;
	name: string;
	config: PersistentDatabaseConfig;
	recreate: () => Promise<T>;
}): Promise<T> => {
	const migrationMarker = await database.getLocal(getMigrationLocalDocId(name));
	if (getMigrationMarkerStatus(migrationMarker) !== 'failed') {
		return database;
	}

	dbLogger.warn(`Storage migration previously failed for "${name}" — resetting target database`, {
		context: { databaseName: name },
	});

	await database.close();
	await removeRxDatabase(name, config.storage as any, config.multiInstance ?? true);

	return recreate();
};

/**
 * Creates the User database
 */
export const createUserDB = async () => {
	const { oldName: oldDatabaseName, newName: name } = getUserDatabaseNames();
	try {
		const initialDatabase = await createRxDatabase<UserCollections>({
			name,
			...defaultConfig,
			localDocuments: true,
		});
		const db = await resetFailedMigrationTargetIfNeeded({
			database: initialDatabase as any,
			name,
			config: defaultConfig,
			recreate: () =>
				createRxDatabase<UserCollections>({
					name,
					...defaultConfig,
					localDocuments: true,
				}),
		});
		await db?.addCollections(userCollections);
		await runPersistentStorageMigration('user', db, oldDatabaseName, userCollections);
		return db;
	} catch (error) {
		dbLogger.error('Failed to create user database', {
			showToast: true,
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.CONNECTION_FAILED,
				databaseName: name,
				error: error instanceof Error ? error.message : String(error),
			},
		});
		// removeDB('wcposusers_v150');
	}
};

/**
 * creates the Store database
 */
export const createStoreDB = async (id: string) => {
	const { oldName: oldDatabaseName, newName: name } = getStoreDatabaseNames(id); // Database name needs to start with a letter, id is a short uuid
	try {
		const initialDatabase = await createRxDatabase<StoreCollections>({
			name,
			allowSlowCount: true,
			...defaultConfig,
			localDocuments: true,
			closeDuplicates: true, // Allow returning existing DB when switching back to a store
		});
		const db = await resetFailedMigrationTargetIfNeeded({
			database: initialDatabase as any,
			name,
			config: defaultConfig,
			recreate: () =>
				createRxDatabase<StoreCollections>({
					name,
					allowSlowCount: true,
					...defaultConfig,
					localDocuments: true,
					closeDuplicates: true,
				}),
		});
		await db?.addCollections(storeCollections);
		await runPersistentStorageMigration('store', db, oldDatabaseName, storeCollections);
		return db;
	} catch (error) {
		dbLogger.error('Failed to create store database', {
			showToast: true,
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.CONNECTION_FAILED,
				databaseName: name,
				storeId: id,
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
};

/**
 * creates the Sync State database
 */
export const createFastStoreDB = async (id: string) => {
	const { oldName: oldDatabaseName, newName: name } = getFastStoreDatabaseNames(id);
	try {
		const initialDatabase = await createRxDatabase<SyncCollections>({
			name,
			allowSlowCount: true,
			...fastStorageConfig,
			localDocuments: true,
			closeDuplicates: true, // Allow returning existing DB when switching back to a store
		});
		const db = await resetFailedMigrationTargetIfNeeded({
			database: initialDatabase as any,
			name,
			config: fastStorageConfig,
			recreate: () =>
				createRxDatabase<SyncCollections>({
					name,
					allowSlowCount: true,
					...fastStorageConfig,
					localDocuments: true,
					closeDuplicates: true,
				}),
		});
		await db?.addCollections(syncCollections);
		await runPersistentStorageMigration('fast-store', db, oldDatabaseName, syncCollections);
		return db;
	} catch (error) {
		dbLogger.error('Failed to create fast store database', {
			showToast: true,
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.CONNECTION_FAILED,
				databaseName: name,
				storeId: id,
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
};

/**
 * creates the Emphemeral database
 */
export const createTemporaryDB = async () => {
	try {
		const db = await createRxDatabase<TemporaryCollections>({
			name: 'temporary',
			...ephemeralStorageConfig,
		});

		const cols = await db?.addCollections(temporaryCollections);
		cols.orders.postCreate(function (plainData, rxDocument) {
			Object.defineProperty(rxDocument, 'isNew', {
				get: () => true,
			});
		});

		return db;
	} catch (error) {
		dbLogger.error('Failed to create temporary database', {
			showToast: true,
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.CONNECTION_FAILED,
				databaseName: 'temporary',
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
};
