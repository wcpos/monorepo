export type StorageMigrationStatus = 'pending' | 'complete' | 'cleanup-pending' | 'failed';
export type StorageMigrationDatabaseKind = 'user' | 'store' | 'fast-store';

export interface StorageMigrationDatabase {
	name: string;
	getLocal(localDocId: string): Promise<any>;
	insertLocal(localDocId: string, data: any): Promise<unknown>;
	upsertLocal(localDocId: string, data: any): Promise<unknown>;
}

export interface StorageMigrationConfig {
	oldStorage: any;
	sourceStorage: string;
	targetStorage: string;
}

export interface StorageMigrationMeta {
	status: StorageMigrationStatus;
	oldDatabaseName: string;
	newDatabaseName: string;
	sourceStorage: string;
	targetStorage: string;
	startedAt?: string;
	ownerId?: string;
	migratedAt?: string;
	cleanupAt?: string;
}

export interface RunStorageMigrationInput {
	database: StorageMigrationDatabase;
	oldDatabaseName: string;
	oldStorage: any;
	sourceStorage: string;
	targetStorage: string;
}
