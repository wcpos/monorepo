import { migrateStorage } from 'rxdb/plugins/migration-storage';

import { logStorageMigration, logStorageMigrationError } from './log-migration';

import type {
	RunStorageMigrationInput,
	StorageMigrationMeta,
	StorageMigrationStatus,
} from './types';

const MIGRATION_LOCAL_DOC_PREFIX = 'storage-migration::';

const SKIP_STATUSES: StorageMigrationStatus[] = ['pending', 'cleanup-pending', 'complete'];

export const getMigrationLocalDocId = (databaseName: string) =>
	`${MIGRATION_LOCAL_DOC_PREFIX}${databaseName}`;

export const shouldRunStorageMigration = ({
	oldName,
	newName,
}: {
	oldName: string;
	newName: string;
}) => oldName !== newName;

const getMigrationMarkerStatus = (marker: any): StorageMigrationStatus | undefined =>
	marker?.data?.status ?? marker?.status;

const buildMigrationMarker = (
	input: Pick<RunStorageMigrationInput, 'oldDatabaseName' | 'sourceStorage' | 'targetStorage'> & {
		newDatabaseName: string;
		status: StorageMigrationStatus;
	}
): StorageMigrationMeta => ({
	status: input.status,
	oldDatabaseName: input.oldDatabaseName,
	newDatabaseName: input.newDatabaseName,
	sourceStorage: input.sourceStorage,
	targetStorage: input.targetStorage,
	...(input.status === 'cleanup-pending' ? { migratedAt: new Date().toISOString() } : {}),
});

const isSkipStatus = (status: StorageMigrationStatus | undefined) =>
	Boolean(status && SKIP_STATUSES.includes(status));

const logExistingMarkerDecision = ({
	databaseName,
	localDocId,
	oldDatabaseName,
	sourceStorage,
	targetStorage,
	status,
}: {
	databaseName: string;
	localDocId: string;
	oldDatabaseName: string;
	sourceStorage: string;
	targetStorage: string;
	status?: StorageMigrationStatus;
}) => {
	const context = {
		databaseName,
		oldDatabaseName,
		localDocId,
		sourceStorage,
		targetStorage,
		status,
	};

	if (status === 'failed') {
		logStorageMigration('Retrying storage migration because marker status is failed', context);
		return 'retry' as const;
	}

	if (isSkipStatus(status)) {
		logStorageMigration('Skipping storage migration because marker already exists', context);
		return 'skip' as const;
	}

	logStorageMigration('Skipping storage migration because marker status is unrecognized', context);
	return 'skip' as const;
};

export async function runStorageMigration({
	database,
	oldDatabaseName,
	oldStorage,
	sourceStorage,
	targetStorage,
}: RunStorageMigrationInput): Promise<void> {
	if (!shouldRunStorageMigration({ oldName: oldDatabaseName, newName: database.name })) {
		logStorageMigration('Skipping storage migration because the database names match', {
			databaseName: database.name,
			oldDatabaseName,
			sourceStorage,
			targetStorage,
		});
		return;
	}

	const localDocId = getMigrationLocalDocId(database.name);
	let existingMarker: any;
	let insertRaceResolved = false;

	try {
		existingMarker = await database.getLocal(localDocId);
	} catch (error) {
		logStorageMigrationError('Storage migration marker lookup failed', {
			databaseName: database.name,
			oldDatabaseName,
			localDocId,
			sourceStorage,
			targetStorage,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}

	const existingStatus = getMigrationMarkerStatus(existingMarker);

	if (existingMarker && existingStatus) {
		const decision = logExistingMarkerDecision({
			databaseName: database.name,
			oldDatabaseName,
			localDocId,
			sourceStorage,
			targetStorage,
			status: existingStatus,
		});

		if (decision === 'skip') {
			return;
		}

		const pendingMarker = buildMigrationMarker({
			newDatabaseName: database.name,
			oldDatabaseName,
			sourceStorage,
			targetStorage,
			status: 'pending',
		});

		try {
			await database.upsertLocal(localDocId, pendingMarker);
		} catch (error) {
			logStorageMigrationError('Storage migration failed to reserve retry marker state', {
				databaseName: database.name,
				oldDatabaseName,
				localDocId,
				sourceStorage,
				targetStorage,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	} else {
		const pendingMarker = buildMigrationMarker({
			newDatabaseName: database.name,
			oldDatabaseName,
			sourceStorage,
			targetStorage,
			status: 'pending',
		});

		try {
			await database.insertLocal(localDocId, pendingMarker);
		} catch (error) {
			let racedMarker: any;
			try {
				racedMarker = await database.getLocal(localDocId);
			} catch (lookupError) {
				logStorageMigrationError('Storage migration marker lookup failed after insert race', {
					databaseName: database.name,
					oldDatabaseName,
					localDocId,
					sourceStorage,
					targetStorage,
					error: lookupError instanceof Error ? lookupError.message : String(lookupError),
				});
				throw error;
			}

			const racedStatus = getMigrationMarkerStatus(racedMarker);
			if (racedMarker && racedStatus) {
				const decision = logExistingMarkerDecision({
					databaseName: database.name,
					oldDatabaseName,
					localDocId,
					sourceStorage,
					targetStorage,
					status: racedStatus,
				});

				if (decision === 'skip') {
					return;
				}

				const retryMarker = buildMigrationMarker({
					newDatabaseName: database.name,
					oldDatabaseName,
					sourceStorage,
					targetStorage,
					status: 'pending',
				});

				try {
					await database.upsertLocal(localDocId, retryMarker);
					insertRaceResolved = true;
				} catch (retryError) {
					logStorageMigrationError('Storage migration failed to reserve retry marker state', {
						databaseName: database.name,
						oldDatabaseName,
						localDocId,
						sourceStorage,
						targetStorage,
						error: retryError instanceof Error ? retryError.message : String(retryError),
					});
					throw retryError;
				}
			}

			if (!insertRaceResolved) {
				throw error;
			}
		}
	}

	logStorageMigration('Starting storage migration', {
		databaseName: database.name,
		oldDatabaseName,
		sourceStorage,
		targetStorage,
	});

	try {
		await migrateStorage({
			database: database as any,
			oldDatabaseName,
			oldStorage,
			batchSize: 500,
			parallel: false,
		});
	} catch (error) {
		logStorageMigrationError('Storage migration failed', {
			databaseName: database.name,
			oldDatabaseName,
			sourceStorage,
			targetStorage,
			error: error instanceof Error ? error.message : String(error),
		});

		try {
			await database.upsertLocal(
				localDocId,
				buildMigrationMarker({
					newDatabaseName: database.name,
					oldDatabaseName,
					sourceStorage,
					targetStorage,
					status: 'failed',
				})
			);
		} catch {
			// Best effort only; the original migration error remains the source of truth.
		}

		throw error;
	}

	const cleanupPendingMarker = buildMigrationMarker({
		newDatabaseName: database.name,
		oldDatabaseName,
		sourceStorage,
		targetStorage,
		status: 'cleanup-pending',
	});

	try {
		await database.upsertLocal(localDocId, cleanupPendingMarker);
	} catch (error) {
		logStorageMigrationError('Storage migration completed but bookkeeping failed', {
			databaseName: database.name,
			oldDatabaseName,
			localDocId,
			sourceStorage,
			targetStorage,
			error: error instanceof Error ? error.message : String(error),
		});

		try {
			await database.upsertLocal(
				localDocId,
				buildMigrationMarker({
					newDatabaseName: database.name,
					oldDatabaseName,
					sourceStorage,
					targetStorage,
					status: 'failed',
				})
			);
		} catch {
			// Best effort only; the original bookkeeping error remains the source of truth.
		}

		throw error;
	}

	logStorageMigration('Storage migration completed', {
		databaseName: database.name,
		oldDatabaseName,
		sourceStorage,
		targetStorage,
		status: cleanupPendingMarker.status,
	});
}
