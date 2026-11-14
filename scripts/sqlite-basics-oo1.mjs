import { boolParamsToInt } from 'rxdb-premium/plugins/storage-sqlite';

export function getSQLiteBasicsOo1({ openDb, journalMode, settleOpen = () => {} }) {
	const basics = {
		async open(name) {
			const db = await openDb(name);
			// WAL on the wasm build only takes with exclusive locking, and it must be set first
			// (sqlite.org/wal.html "Use of WAL Without Shared-Memory"). Without it the WAL pragma
			// silently answers "delete" — measured in Node on 3.53.4.
			try {
				db.exec('PRAGMA locking_mode = exclusive');
			} catch (error) {
				settleOpen(db);
				throw error;
			}
			return db;
		},
		async all(db, q) {
			return db.exec({
				sql: q.query,
				bind: boolParamsToInt(q.params),
				rowMode: 'object',
				returnValue: 'resultRows',
			});
		},
		async run(db, q) {
			db.exec({ sql: q.query, bind: boolParamsToInt(q.params) });
		},
		async setPragma(db, key, value) {
			db.exec('PRAGMA ' + key + ' = ' + value);
			if (key === 'journal_mode') {
				// SQLite answers a journal-mode change with the mode actually in effect and never
				// errors on a refused one, so the verdict must fail loudly when they differ.
				const effective = String(db.selectValue('PRAGMA journal_mode'));
				if (effective.toLowerCase() !== String(value).toLowerCase()) {
					throw new Error(
						'SQLite journal_mode ' + value + ' requested but ' + effective + ' in effect'
					);
				}
				// #2144: WAL + NORMAL on every SQLite platform.
				db.exec('PRAGMA synchronous = NORMAL');
			}
		},
		async close(db) {
			settleOpen(db);
			db.close();
		},
		journalMode,
	};
	return {
		...basics,
		// settleOpen gives back an open's pool reservation once its WAL slot is claimed (#2347). A new
		// database claims it on its first read, not on the pragma (measured on SAHPool in Chromium).
		async setPragma(db, key, value) {
			if (key !== 'journal_mode') return basics.setPragma(db, key, value);
			try {
				await basics.setPragma(db, key, value);
				db.selectValue('SELECT 1 FROM sqlite_schema LIMIT 1');
			} finally {
				settleOpen(db);
			}
		},
	};
}
