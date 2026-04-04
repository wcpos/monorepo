const MIGRATION_LOCAL_DOC_PREFIX = 'storage-migration::';

export const getMigrationLocalDocId = (databaseName: string) =>
	`${MIGRATION_LOCAL_DOC_PREFIX}${databaseName}`;
