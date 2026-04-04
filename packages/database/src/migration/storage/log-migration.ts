import { getLogger } from '@wcpos/utils/logger';

const migrationLogger = getLogger(['wcpos', 'db', 'storage-migration']);

type LoggerContext = Record<string, unknown>;

export const logStorageMigration = (event: string, context: LoggerContext = {}) => {
	migrationLogger.info(event, { context });
};

export const logStorageMigrationError = (event: string, context: LoggerContext = {}) => {
	migrationLogger.error(event, { saveToDb: true, context });
};
