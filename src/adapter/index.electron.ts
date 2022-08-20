import { getRxStorageSQLite, SQLiteQueryWithParams } from 'rxdb-premium/plugins/sqlite';

const sqliteBasics = {
	open: async (name: string) => {
		return window.sqlite.open(name);
	},
	all: async (db, queryWithParams: SQLiteQueryWithParams) => {
		console.log(`all sql: ${queryWithParams.query}`, queryWithParams.params);

		const result = await window.sqlite.all(db.name, queryWithParams);
		console.log(result);
		return result;
	},
	run: async (db, queryWithParams: SQLiteQueryWithParams) => {
		console.log(`run sql: ${queryWithParams.query}`, queryWithParams.params);
		console.log(db);

		await window.sqlite.run(db.name, queryWithParams);
	},
	close: async () => {
		debugger;
		// window.sqlite.close();
	},
	journalMode: '',
};

const config = {
	storage: getRxStorageSQLite({
		/**
		 * Different runtimes have different interfaces to SQLite.
		 * For example in node.js we have a callback API,
		 * while in capacitor sqlite we have Promises.
		 * So we need a helper object that is capable of doing the basic
		 * sqlite operations.
		 */
		sqliteBasics,
	}),
	multiInstance: false,
	ignoreDuplicate: true,
};

export default config;
