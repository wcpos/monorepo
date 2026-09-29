import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

const shipped = new URL('../apps/main/public/', import.meta.url);
test('shipped SQLite worker carries the premium translation patch exactly once', async () => {
	const worker = await readFile(new URL('sqlite.worker.js', shipped), 'utf8');
	assert.equal(worker.split('WCPOS_SQLITE_QUERY_TRANSLATION_PATCH=1').length - 1, 1);
	assert.ok(worker.includes('/* WCPOS_SQLITE_WORKER */'));
});
test('shipped wasm is the installed build, including its wasm magic', async () => {
	const actual = await readFile(new URL('sqlite3.wasm', shipped));
	const installed = await readFile(
		new URL(import.meta.resolve('@sqlite.org/sqlite-wasm/sqlite3.wasm'))
	);
	assert.deepEqual(actual.subarray(0, 4), Buffer.from([0, 97, 115, 109]));
	const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
	assert.equal(sha(actual), sha(installed));
});
test('oo1 adapter enforces WAL, NORMAL, and boolean bindings', async () => {
	const { getSQLiteBasicsOo1 } = await import('./sqlite-basics-oo1.mjs');
	const sqlite3 = await sqlite3InitModule();
	// Node's wasm VFS provides a temporary virtual filesystem (not host persistence).
	const basics = getSQLiteBasicsOo1({
		openDb: (name) => new sqlite3.oo1.DB(name, 'c'),
		journalMode: 'WAL',
	});
	const db = await basics.open('/pr3a-test.sqlite');
	try {
		assert.equal(db.selectValue('PRAGMA locking_mode'), 'exclusive');
		await basics.setPragma(db, 'journal_mode', 'WAL');
		assert.equal(db.selectValue('PRAGMA journal_mode'), 'wal');
		assert.equal(db.selectValue('PRAGMA synchronous'), 1);
		await basics.run(db, { query: 'CREATE TABLE flags (value INTEGER)', params: [] });
		await basics.run(db, { query: 'INSERT INTO flags VALUES (?)', params: [true] });
		assert.deepEqual(
			(
				await basics.all(db, { query: 'SELECT value FROM flags WHERE value = ?', params: [true] })
			).map((row) => ({ ...row })),
			[{ value: 1 }]
		);
		assert.deepEqual(
			(await basics.all(db, { query: 'SELECT ? AS value', params: [false] })).map((row) => ({
				...row,
			})),
			[{ value: 0 }]
		);
	} finally {
		await basics.close(db);
	}
	const memory = await basics.open(':memory:');
	try {
		await assert.rejects(basics.setPragma(memory, 'journal_mode', 'WAL'), /requested but memory/);
	} finally {
		await basics.close(memory);
	}
});
