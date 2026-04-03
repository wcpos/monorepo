import { migrateStorage } from 'rxdb/plugins/migration-storage';

import { logStorageMigration, logStorageMigrationError } from './log-migration';

import type {
	RunStorageMigrationInput,
	StorageMigrationMeta,
	StorageMigrationStatus,
} from './types';

type RunStorageMigrationWithPreparationInput = RunStorageMigrationInput & {
	prepareOldDatabase?: () => Promise<void> | void;
};

const MIGRATION_LOCAL_DOC_PREFIX = 'storage-migration::';
const MIGRATION_RUN_OWNER_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
// A pending marker is only considered stale after this lease expires.
const PENDING_MARKER_STALE_AFTER_MS = 15 * 60 * 1000;

const SKIP_STATUSES: StorageMigrationStatus[] = ['cleanup-pending', 'complete'];

export const getMigrationLocalDocId = (databaseName: string) =>
	`${MIGRATION_LOCAL_DOC_PREFIX}${databaseName}`;

export const shouldRunStorageMigration = ({
	oldName,
	newName,
}: {
	oldName: string;
	newName: string;
}) => oldName !== newName;

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

const getMigrationMarkerStatus = (marker: any): StorageMigrationStatus | undefined =>
	getMarkerData(marker)?.status;

const getMigrationMarkerStartedAt = (marker: any): string | undefined =>
	getMarkerData(marker)?.startedAt;

const getMigrationMarkerStartedAtTime = (marker: any): number | undefined => {
	const startedAt = getMigrationMarkerStartedAt(marker);
	if (!startedAt) {
		return undefined;
	}

	const startedAtTime = Date.parse(startedAt);
	return Number.isNaN(startedAtTime) ? undefined : startedAtTime;
};

const getMigrationMarkerOwnerId = (marker: any): string | undefined =>
	getMarkerData(marker)?.ownerId;

const getMarkerFromWriteConflict = (error: any) => error?.documentInDb;

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
	...(input.status === 'pending'
		? {
				startedAt: new Date().toISOString(),
				ownerId: MIGRATION_RUN_OWNER_ID,
			}
		: {}),
	...(input.status === 'cleanup-pending' ? { migratedAt: new Date().toISOString() } : {}),
});

const isSkipStatus = (status: StorageMigrationStatus | undefined) =>
	Boolean(status && SKIP_STATUSES.includes(status));

const getExistingMarkerDecision = ({
	status,
	startedAtTime,
	ownerId,
}: {
	status?: StorageMigrationStatus;
	startedAtTime?: number;
	ownerId?: string;
}) => {
	if (status === 'failed') {
		return 'retry' as const;
	}

	if (status === 'pending') {
		if (ownerId && ownerId === MIGRATION_RUN_OWNER_ID) {
			return 'skip' as const;
		}

		if (startedAtTime === undefined) {
			return 'retry' as const;
		}

		const isStalePending = Date.now() - startedAtTime >= PENDING_MARKER_STALE_AFTER_MS;
		return isStalePending ? ('retry' as const) : ('skip' as const);
	}

	if (isSkipStatus(status)) {
		return 'skip' as const;
	}

	return 'skip' as const;
};

const logExistingMarkerDecision = ({
	databaseName,
	localDocId,
	oldDatabaseName,
	sourceStorage,
	targetStorage,
	status,
	startedAt,
	startedAtTime,
	ownerId,
}: {
	databaseName: string;
	localDocId: string;
	oldDatabaseName: string;
	sourceStorage: string;
	targetStorage: string;
	status?: StorageMigrationStatus;
	startedAt?: string;
	startedAtTime?: number;
	ownerId?: string;
}) => {
	const context = {
		databaseName,
		oldDatabaseName,
		localDocId,
		sourceStorage,
		targetStorage,
		status,
		startedAt,
		ownerId,
	};

	const decision = getExistingMarkerDecision({ status, startedAtTime, ownerId });

	if (status === 'failed') {
		logStorageMigration('Retrying storage migration because marker status is failed', context);
		return decision;
	}

	if (status === 'pending') {
		if (ownerId && ownerId === MIGRATION_RUN_OWNER_ID) {
			logStorageMigration(
				'Skipping storage migration because marker is already pending in this launch',
				context
			);
			return decision;
		}

		if (startedAtTime === undefined) {
			logStorageMigration('Retrying storage migration because marker status is pending', context);
			return decision;
		}

		if (decision === 'retry') {
			logStorageMigration('Retrying storage migration because marker status is pending', context);
			return decision;
		}

		logStorageMigration(
			'Skipping storage migration because marker is already pending in another active launch',
			context
		);
		return decision;
	}

	if (isSkipStatus(status)) {
		logStorageMigration('Skipping storage migration because marker already exists', context);
		return decision;
	}

	logStorageMigration('Skipping storage migration because marker status is unrecognized', context);
	return decision;
};

const buildMarkerDecisionContext = ({
	databaseName,
	oldDatabaseName,
	localDocId,
	sourceStorage,
	targetStorage,
	marker,
}: {
	databaseName: string;
	oldDatabaseName: string;
	localDocId: string;
	sourceStorage: string;
	targetStorage: string;
	marker: any;
}) => ({
	databaseName,
	oldDatabaseName,
	localDocId,
	sourceStorage,
	targetStorage,
	status: getMigrationMarkerStatus(marker),
	startedAt: getMigrationMarkerStartedAt(marker),
	startedAtTime: getMigrationMarkerStartedAtTime(marker),
	ownerId: getMigrationMarkerOwnerId(marker),
});

const markerBelongsToCurrentRun = (marker: any) =>
	getMigrationMarkerStatus(marker) === 'pending' &&
	getMigrationMarkerOwnerId(marker) === MIGRATION_RUN_OWNER_ID;

async function claimRetryableMarker({
	database,
	marker,
	pendingMarker,
	databaseName,
	oldDatabaseName,
	localDocId,
	sourceStorage,
	targetStorage,
}: {
	database: Pick<RunStorageMigrationInput['database'], 'getLocal'>;
	marker: any;
	pendingMarker: StorageMigrationMeta;
	databaseName: string;
	oldDatabaseName: string;
	localDocId: string;
	sourceStorage: string;
	targetStorage: string;
}): Promise<'claimed' | 'skip'> {
	const markerContext = buildMarkerDecisionContext({
		databaseName,
		oldDatabaseName,
		localDocId,
		sourceStorage,
		targetStorage,
		marker,
	});
	const initialDecision = getExistingMarkerDecision(markerContext);

	if (typeof marker?.incrementalModify !== 'function') {
		if (initialDecision === 'skip') {
			return 'skip';
		}
		throw new Error(
			'Retryable storage migration marker cannot be claimed without incrementalModify'
		);
	}

	const claimedMarker = await marker.incrementalModify((currentData: any) => {
		const currentMarker = { data: currentData };
		const decision = getExistingMarkerDecision(
			buildMarkerDecisionContext({
				databaseName,
				oldDatabaseName,
				localDocId,
				sourceStorage,
				targetStorage,
				marker: currentMarker,
			})
		);

		if (decision !== 'retry') {
			return currentData;
		}

		return pendingMarker;
	});

	if (markerBelongsToCurrentRun(claimedMarker)) {
		return 'claimed';
	}

	const refreshedMarker = await database.getLocal(localDocId);

	if (markerBelongsToCurrentRun(refreshedMarker)) {
		return 'claimed';
	}

	logExistingMarkerDecision(
		buildMarkerDecisionContext({
			databaseName,
			oldDatabaseName,
			localDocId,
			sourceStorage,
			targetStorage,
			marker: refreshedMarker,
		})
	);

	return 'skip';
}

export async function runStorageMigration({
	database,
	oldDatabaseName,
	oldStorage,
	sourceStorage,
	targetStorage,
	prepareOldDatabase,
}: RunStorageMigrationWithPreparationInput): Promise<void> {
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
		const decision = logExistingMarkerDecision(
			buildMarkerDecisionContext({
				databaseName: database.name,
				oldDatabaseName,
				localDocId,
				sourceStorage,
				targetStorage,
				marker: existingMarker,
			})
		);

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
			const claimResult = await claimRetryableMarker({
				database,
				marker: existingMarker,
				pendingMarker,
				databaseName: database.name,
				oldDatabaseName,
				localDocId,
				sourceStorage,
				targetStorage,
			});

			if (claimResult === 'skip') {
				return;
			}
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
			let racedMarker: any = getMarkerFromWriteConflict(error);
			if (!racedMarker) {
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
			}

			const racedStatus = getMigrationMarkerStatus(racedMarker);
			if (racedMarker && racedStatus) {
				const decision = logExistingMarkerDecision(
					buildMarkerDecisionContext({
						databaseName: database.name,
						oldDatabaseName,
						localDocId,
						sourceStorage,
						targetStorage,
						marker: racedMarker,
					})
				);

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
					let markerToClaim = racedMarker;
					if (typeof markerToClaim?.incrementalModify !== 'function') {
						try {
							markerToClaim = await database.getLocal(localDocId);
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
					}

					const claimResult = await claimRetryableMarker({
						database,
						marker: markerToClaim,
						pendingMarker: retryMarker,
						databaseName: database.name,
						oldDatabaseName,
						localDocId,
						sourceStorage,
						targetStorage,
					});
					insertRaceResolved = claimResult === 'claimed';
					if (claimResult === 'skip') {
						return;
					}
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

	if (prepareOldDatabase) {
		try {
			await prepareOldDatabase();
		} catch (error) {
			logStorageMigrationError('Storage migration failed while preparing the old database', {
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
				// Best effort only; the original preparation error remains the source of truth.
			}

			throw error;
		}
	}

	try {
		logStorageMigration('Starting storage migration', {
			databaseName: database.name,
			oldDatabaseName,
			sourceStorage,
			targetStorage,
		});

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
