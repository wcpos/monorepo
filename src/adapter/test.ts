export function getSQLiteBasicsCapacitor(
	sqlite: SQLiteConnection,
	capacitorCore: any
): SQLiteBasics<SQLiteCapacitorDatabase> {
	let basics: SQLiteBasics<SQLiteCapacitorDatabase> | undefined =
		BASICS_BY_SQLITE_LIB_CAPACITOR.get(sqlite);
	if (!basics) {
		basics = {
			async open(dbName: string) {
				const db = await sqlite.createConnection(dbName, false, 'no-encryption', 1);
				await db.open();
				return db;
			},
			async run(db: SQLiteCapacitorDatabase, queryWithParams: SQLiteQueryWithParams) {
				await db.run(queryWithParams.query, queryWithParams.params, false);
			},
			async all(db: SQLiteCapacitorDatabase, queryWithParams: SQLiteQueryWithParams) {
				const result: any = await db.query(queryWithParams.query, queryWithParams.params);
				return ensureNotFalsy(result.values);
			},
			close(db: SQLiteCapacitorDatabase) {
				return db.close();
			},
			/**
			 * On android, there is already WAL mode set.
			 * So we do not have to set it by our own.
			 * @link https://github.com/capacitor-community/sqlite/issues/258#issuecomment-1102966087
			 */
			journalMode: capacitorCore.getPlatform() === 'android' ? '' : 'WAL',
		};
		BASICS_BY_SQLITE_LIB.set(sqlite, basics);
	}
	return basics;
}
