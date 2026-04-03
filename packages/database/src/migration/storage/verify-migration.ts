import { cleanupOldDatabase } from './cleanup';
import { logStorageMigration, logStorageMigrationError } from './log-migration';
import { getMigrationLocalDocId } from './run-storage-migration';

import type {
	StorageMigrationDatabase,
	StorageMigrationMeta,
	StorageMigrationStatus,
} from './types';

export { getMigrationLocalDocId } from './run-storage-migration';

const STORAGE_MIGRATION_MODULE_LOADED_AT = Date.now();

interface VerifyStorageMigrationInput {
	database: StorageMigrationDatabase;
	oldDatabaseName: string;
	sourceStorage: string;
	targetStorage: string;
}

const getMarkerData = (marker: any): StorageMigrationMeta | undefined => {
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

const getMarkerStatus = (marker: any): StorageMigrationStatus | undefined =>
	getMarkerData(marker)?.status;

const getMarkerOldDatabaseName = (marker: any, fallback: string) =>
	getMarkerData(marker)?.oldDatabaseName ?? fallback;

const getMarkerMigratedAt = (marker: any) => {
	const migratedAt = getMarkerData(marker)?.migratedAt;
	if (!migratedAt) {
		return undefined;
	}

	const timestamp = Date.parse(migratedAt);
	return Number.isFinite(timestamp) ? timestamp : undefined;
};

export async function verifyStorageMigration({
	database,
	oldDatabaseName,
	sourceStorage,
	targetStorage,
}: VerifyStorageMigrationInput): Promise<void> {
	const localDocId = getMigrationLocalDocId(database.name);

	let marker: any;
	try {
		marker = await database.getLocal(localDocId);
	} catch (error) {
		logStorageMigrationError('Storage migration verification lookup failed', {
			databaseName: database.name,
			oldDatabaseName,
			localDocId,
			sourceStorage,
			targetStorage,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}

	const markerData = getMarkerData(marker);
	const markerStatus = getMarkerStatus(marker);

	if (!markerData || markerStatus !== 'cleanup-pending') {
		return;
	}

	if (markerData.sourceStorage !== sourceStorage || markerData.targetStorage !== targetStorage) {
		logStorageMigration('Skipping storage cleanup because marker labels do not match', {
			databaseName: database.name,
			oldDatabaseName,
			localDocId,
			sourceStorage,
			targetStorage,
			markerSourceStorage: markerData.sourceStorage,
			markerTargetStorage: markerData.targetStorage,
		});
		return;
	}

	const migratedAt = getMarkerMigratedAt(marker);
	if (migratedAt === undefined || migratedAt >= STORAGE_MIGRATION_MODULE_LOADED_AT) {
		logStorageMigration(
			'Skipping deferred storage cleanup because marker was created during this launch',
			{
				databaseName: database.name,
				oldDatabaseName,
				localDocId,
				sourceStorage,
				targetStorage,
				markerMigratedAt: markerData.migratedAt,
				moduleLoadedAt: new Date(STORAGE_MIGRATION_MODULE_LOADED_AT).toISOString(),
			}
		);
		return;
	}

	const databaseNameToDelete = getMarkerOldDatabaseName(marker, oldDatabaseName);

	logStorageMigration('Verifying deferred storage cleanup', {
		databaseName: database.name,
		oldDatabaseName: databaseNameToDelete,
		localDocId,
		sourceStorage,
		targetStorage,
	});

	try {
		await cleanupOldDatabase(databaseNameToDelete);
	} catch (error) {
		logStorageMigrationError('Deferred storage cleanup failed', {
			databaseName: database.name,
			oldDatabaseName: databaseNameToDelete,
			localDocId,
			sourceStorage,
			targetStorage,
			error: error instanceof Error ? error.message : String(error),
		});
		return;
	}

	try {
		await database.upsertLocal(localDocId, {
			...markerData,
			status: 'complete',
			cleanupAt: new Date().toISOString(),
		});
	} catch (error) {
		logStorageMigrationError('Storage migration verification completed but bookkeeping failed', {
			databaseName: database.name,
			oldDatabaseName: databaseNameToDelete,
			localDocId,
			sourceStorage,
			targetStorage,
			error: error instanceof Error ? error.message : String(error),
		});
		return;
	}

	logStorageMigration('Deferred storage cleanup completed', {
		databaseName: database.name,
		oldDatabaseName: databaseNameToDelete,
		localDocId,
		sourceStorage,
		targetStorage,
	});
}
