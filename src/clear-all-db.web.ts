/**
 *
 */
export const clearAllDB = async (): Promise<void> => {
	// Get the list of all databases
	const databases: IDBDatabaseInfo[] = await indexedDB.databases();

	// Create an array of promises for each delete operation
	const deletePromises: Promise<void>[] = databases.map((db) => {
		return new Promise<void>((resolve, reject) => {
			const dbName = db.name;
			if (dbName) {
				const request = indexedDB.deleteDatabase(dbName);

				request.onsuccess = () => {
					console.log(`Deleted database: ${dbName}`);
					resolve();
				};

				request.onerror = () => {
					console.error(`Failed to delete database: ${dbName}`);
					reject(`Failed to delete database: ${dbName}`);
				};

				request.onblocked = () => {
					console.warn(`Deletion blocked for database: ${dbName}`);
					resolve(); // Resolve even if deletion is blocked, as there's nothing more we can do
				};
			} else {
				resolve(); // Resolve immediately if dbName is not defined
			}
		});
	});

	// Return a promise that resolves when all delete operations are complete
	await Promise.all(deletePromises);
};
