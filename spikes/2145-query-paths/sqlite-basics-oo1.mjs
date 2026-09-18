import { boolParamsToInt } from 'rxdb-premium/plugins/storage-sqlite';

export function getSQLiteBasicsOo1({ openDb, journalMode }) {
	return {
		async open(name) {
			const db = await openDb(name);
			// WAL on the wasm build only takes with exclusive locking, and it must be set first
			// (sqlite.org/wal.html "Use of WAL Without Shared-Memory"). Without it the WAL pragma
			// silently answers "delete" — measured in Node on 3.53.4.
			db.exec('PRAGMA locking_mode = exclusive');
			console.info('spike-2138 journal_mode after open:', db.selectValue('PRAGMA journal_mode'));
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
				console.info('spike-2138 journal_mode requested/effective:', value, effective);
				if (effective.toLowerCase() !== String(value).toLowerCase()) {
					throw new Error(
						'spike-2138: journal_mode ' + value + ' requested but ' + effective + ' in effect'
					);
				}
			}
		},
		async close(db) {
			db.close();
		},
		journalMode,
	};
}
