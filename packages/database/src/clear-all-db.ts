import { Directory, Paths } from 'expo-file-system';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { NATIVE_SQLITE_ROOT } from './adapters/storage/sqlite-root';

const dbLogger = getLogger(['wcpos', 'db', 'clear']);
const EXPO_OPFS_ROOT = new Directory(Paths.document, '.expo-opfs');
const LEGACY_SQLITE_DIRECTORY = new Directory(Paths.document, 'SQLite');

export interface ClearDBResult {
	success: boolean;
	message: string;
	databasesDeleted: number;
}

export const clearAllDB = async (): Promise<ClearDBResult> => {
	try {
		dbLogger.debug('Starting to clear all application databases');
		let deletedCount = 0;
		for (const root of [NATIVE_SQLITE_ROOT, EXPO_OPFS_ROOT, LEGACY_SQLITE_DIRECTORY]) {
			if (!root.exists) continue;
			root.delete();
			deletedCount++;
		}

		const message =
			deletedCount > 0
				? `Successfully cleared ${deletedCount} database entries`
				: 'No databases found to clear (this might mean the app is already in a clean state)';

		dbLogger.info(message);

		return {
			success: true,
			message,
			databasesDeleted: deletedCount,
		};
	} catch (error) {
		dbLogger.error('Failed to clear databases', {
			showToast: true,
			code: ERROR_CODES.LOCAL_DB_SETUP_FAILED,
			context: {
				error: error instanceof Error ? error.message : String(error),
			},
		});
		throw error;
	}
};
