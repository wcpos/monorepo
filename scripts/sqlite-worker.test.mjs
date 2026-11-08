import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

import { quietRecoveredConstraintWarnings } from './sqlite-quiet-constraint.mjs';

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
test('recovered INSERT constraint failures are quiet; other step failures still warn (#2334)', async () => {
	const sqlite3 = await sqlite3InitModule();
	const originalWarn = sqlite3.config.warn;
	const warnings = [];
	sqlite3.config.warn = (...args) => warnings.push(args);
	quietRecoveredConstraintWarnings(sqlite3);
	const db = new sqlite3.oo1.DB(':memory:', 'c');
	try {
		db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, u TEXT UNIQUE, n INTEGER CHECK (n >= 0))');
		db.exec("INSERT INTO t VALUES ('a', 'x', 1)");

		assert.throws(() => db.exec("INSERT INTO t VALUES ('a', 'y', 1)"));
		assert.deepEqual(warnings, []);
		assert.throws(() => db.exec("INSERT INTO t VALUES ('b', 'x', 1)"));
		assert.deepEqual(warnings, []);

		assert.throws(() => db.exec("INSERT INTO t VALUES ('b', 'y', -1)"));
		assert.equal(warnings.length, 1);
		assert.equal(warnings[0][0], 'sqlite3_step() rc=');
		assert.equal(warnings[0][1], 275);
		assert.match(warnings[0][4], /INSERT/);

		db.exec("INSERT INTO t VALUES ('b', 'y', 1)");
		assert.throws(() => db.exec("UPDATE t SET id='a' WHERE id='b'"));
		assert.equal(warnings.length, 2);
		assert.equal(warnings[1][1], 1555);

		sqlite3.config.warn('other', 1);
		assert.equal(warnings.length, 3);
		assert.deepEqual(warnings[2], ['other', 1]);
	} finally {
		db.close();
		sqlite3.config.warn = originalWarn;
	}
});
const poolFake = ({ files, capacity }) => {
	const calls = [];
	return {
		calls,
		getFileCount: () => files,
		getCapacity: () => capacity,
		addCapacity: async (n) => {
			calls.push(n);
			capacity += n;
			return capacity;
		},
	};
};
const poolLimits = { filesPerDatabase: 2, growthStep: 16, maxCapacity: 246 };
test('pool capacity: room for one more database does not grow the pool', async () => {
	const { ensurePoolCapacity } = await import('./sqlite-pool-capacity.mjs');
	const pool = poolFake({ files: 20, capacity: 22 });
	await ensurePoolCapacity(pool, poolLimits);
	assert.deepEqual(pool.calls, []);
});
test('pool capacity: grows by one step under the cap', async () => {
	const { ensurePoolCapacity } = await import('./sqlite-pool-capacity.mjs');
	const pool = poolFake({ files: 22, capacity: 22 });
	await ensurePoolCapacity(pool, poolLimits);
	assert.deepEqual(pool.calls, [16]);
});
test('pool capacity: grows by a partial step up to the cap', async () => {
	const { ensurePoolCapacity } = await import('./sqlite-pool-capacity.mjs');
	const pool = poolFake({ files: 240, capacity: 240 });
	await ensurePoolCapacity(pool, poolLimits);
	assert.deepEqual(pool.calls, [6]);
});
test('pool capacity: at the cap with no room rejects with SqlitePoolFullError', async () => {
	const { ensurePoolCapacity } = await import('./sqlite-pool-capacity.mjs');
	const pool = poolFake({ files: 246, capacity: 246 });
	await assert.rejects(ensurePoolCapacity(pool, poolLimits), (error) => {
		assert.equal(error.name, 'SqlitePoolFullError');
		assert.match(error.message, /246/);
		return true;
	});
	assert.deepEqual(pool.calls, []);
});
test('pool capacity: the cap sits below the 253-handle WebKit ceiling, in whole steps', async () => {
	const { SQLITE_POOL_GROWTH_STEP, SQLITE_POOL_INITIAL_CAPACITY, SQLITE_POOL_MAX_CAPACITY } =
		await import('../packages/database/src/adapters/storage/sqlite-pool.ts');
	assert.ok(SQLITE_POOL_MAX_CAPACITY < 253);
	assert.ok(SQLITE_POOL_MAX_CAPACITY > SQLITE_POOL_INITIAL_CAPACITY);
	assert.equal(
		(SQLITE_POOL_MAX_CAPACITY - SQLITE_POOL_INITIAL_CAPACITY) % SQLITE_POOL_GROWTH_STEP,
		0
	);
});
// Like the SAHPool: growth takes time, so a second grower can interleave, and a file past
// capacity is SQLITE_CANTOPEN (#2347).
const slowPool = (state) => ({
	calls: [],
	getFileCount: () => state.files,
	getCapacity: () => state.capacity,
	async addCapacity(n) {
		this.calls.push(n);
		await new Promise((resolve) => setTimeout(resolve, 5));
		state.capacity += n;
		return state.capacity;
	},
	claim() {
		if (state.files >= state.capacity) throw new Error('SQLITE_CANTOPEN');
		state.files++;
	},
});
const reservations = async (state, maxCapacity = 30) => {
	const { createPoolReservations } = await import('./sqlite-pool-capacity.mjs');
	const pool = slowPool(state);
	const limits = { filesPerDatabase: 2, growthStep: 16, maxCapacity };
	return { pool, reserve: createPoolReservations(pool, limits).reserve };
};
test('pool reservations: concurrent opens that fit only together grow the pool once', async () => {
	for (const files of [20, 22]) {
		const state = { files, capacity: 22 };
		const { pool, reserve } = await reservations(state, 246);
		await Promise.all([reserve(), reserve()]);
		assert.deepEqual(pool.calls, [16], `from ${files} files`);
		for (let i = 0; i < 4; i++) pool.claim();
	}
});
test('pool reservations: concurrent opens near the cap get every slot and a named refusal', async () => {
	const state = { files: 28, capacity: 28 };
	const { reserve } = await reservations(state);
	const results = await Promise.allSettled([reserve(), reserve()]);
	assert.deepEqual(results.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
	assert.equal(results.find((result) => result.reason).reason.name, 'SqlitePoolFullError');
	assert.equal(state.capacity, 30);
});
test('pool reservations: claimed then released gives back exactly the rest, once', async () => {
	const state = { files: 20, capacity: 24 };
	const { pool, reserve } = await reservations(state, 24);
	const first = await reserve();
	pool.claim();
	first.claimed(1);
	first.release();
	first.release();
	const second = await reserve();
	await assert.rejects(reserve(), { name: 'SqlitePoolFullError' });
	second.release();
	await reserve();
});
test('pool reservations: a claimed file is not counted twice near the cap', async () => {
	const state = { files: 26, capacity: 30 };
	const { pool, reserve } = await reservations(state);
	const first = await reserve();
	pool.claim();
	first.claimed(1);
	await reserve();
	for (let i = 0; i < 3; i++) pool.claim();
});
test('pool reservations: a refused open holds nothing and leaves the next one working', async () => {
	const state = { files: 29, capacity: 30 };
	const { reserve } = await reservations(state);
	await assert.rejects(reserve(), { name: 'SqlitePoolFullError' });
	state.files = 28;
	await reserve();
});
// SQLITE_FCNTL_JOURNAL_POINTER answers the WAL file once the pager has opened it.
const walOpen = ({ capi, wasm }, db) =>
	wasm.pstack.call(() => {
		const pointer = wasm.pstack.allocPtr();
		wasm.pokePtr(pointer, 0);
		capi.sqlite3_file_control(db, 'main', capi.SQLITE_FCNTL_JOURNAL_POINTER, pointer);
		const file = wasm.peekPtr(pointer);
		return file !== 0 && wasm.peekPtr(file) !== 0;
	});
test('oo1 adapter settles an open after its WAL is claimed, on a refused journal mode and on close', async () => {
	const { getSQLiteBasicsOo1 } = await import('./sqlite-basics-oo1.mjs');
	const sqlite3 = await sqlite3InitModule();
	const settled = [];
	const openDb = (name) => new sqlite3.oo1.DB(name, 'c');
	const settleOpen = (db) => settled.push({ db, wal: walOpen(sqlite3, db) });
	const basics = getSQLiteBasicsOo1({ openDb, journalMode: 'WAL', settleOpen });
	const db = await basics.open('/settle-test.sqlite');
	await basics.setPragma(db, 'journal_mode', 'WAL');
	assert.deepEqual(settled, [{ db, wal: true }]);
	await basics.setPragma(db, 'synchronous', 'normal');
	assert.equal(settled.length, 1);
	await basics.close(db);
	assert.equal(settled.length, 2);
	const memory = await basics.open(':memory:');
	await assert.rejects(basics.setPragma(memory, 'journal_mode', 'WAL'), /requested but memory/);
	assert.equal(settled.at(-1).db, memory);
	const unused = await basics.open(':memory:');
	await basics.close(unused);
	assert.equal(settled.at(-1).db, unused);
	const plain = getSQLiteBasicsOo1({ openDb, journalMode: 'WAL' });
	const plainDb = await plain.open('/settle-plain.sqlite');
	await plain.setPragma(plainDb, 'journal_mode', 'WAL');
	await plain.close(plainDb);
});
