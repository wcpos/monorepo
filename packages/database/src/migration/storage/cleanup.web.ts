export async function cleanupOldWebDatabase(oldDatabaseName: string) {
	await new Promise<void>((resolve, reject) => {
		const request = indexedDB.deleteDatabase(oldDatabaseName);

		request.onsuccess = () => {
			resolve();
		};

		request.onerror = () => {
			reject(new Error(`Failed to delete database: ${oldDatabaseName}`));
		};

		request.onblocked = () => {
			reject(new Error(`IndexedDB deletion was blocked for database: ${oldDatabaseName}`));
		};
	});
}

export const cleanupOldDatabase = cleanupOldWebDatabase;
