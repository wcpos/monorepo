import * as SQLite from 'expo-sqlite';

export async function cleanupOldNativeDatabase(oldDatabaseName: string) {
	try {
		await SQLite.deleteDatabaseAsync(oldDatabaseName);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.toLowerCase().includes('not exist') || message.toLowerCase().includes('no such')) {
			return;
		}
		throw error;
	}
}

export const cleanupOldDatabase = cleanupOldNativeDatabase;
