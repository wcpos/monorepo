import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import {
	DISTS,
	HEAD_AFTER,
	MARKER,
	TAIL,
	TAIL_AFTER,
	patchDists,
	preparePatch,
} from './patch-rxdb-premium-open-write-count.mjs';

const require = createRequire(import.meta.url);
const root = dirname(require.resolve('rxdb-premium/package.json'));
const file = (base, dist) =>
	join(base, `dist/${dist}/plugins/storage-sqlite/sqlite-storage-instance.js`);

// The installed dist is already patched by postinstall; reverse only our own exact rewrites.
function pristine(dist) {
	const source = readFileSync(file(root, dist), 'utf8');
	const unwrapped = source.replace(TAIL_AFTER, TAIL);
	const head = unwrapped.indexOf(MARKER);
	assert.ok(head > -1, `${dist}: installed dist carries the marker`);
	const callStart = unwrapped.lastIndexOf('return await', head);
	const call = unwrapped.slice(callStart, head);
	return unwrapped.replace(HEAD_AFTER(call), call + '(async()=>{');
}
function fixture(t) {
	const temp = mkdtempSync(join(tmpdir(), 'wcpos-open-write-count-'));
	t.after(() => rmSync(temp, { recursive: true, force: true }));
	for (const dist of DISTS) {
		const path = file(temp, dist);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, pristine(dist));
	}
	return temp;
}

test('patches both dists once and is idempotent', (t) => {
	const temp = fixture(t);
	assert.deepEqual(
		patchDists(temp).map(({ status }) => status),
		['patched', 'patched']
	);
	assert.deepEqual(
		patchDists(temp).map(({ status }) => status),
		['already patched', 'already patched']
	);
	for (const dist of DISTS) {
		const source = readFileSync(file(temp, dist), 'utf8');
		assert.equal(source.split(MARKER).length - 1, 1);
		assert.equal(source.split(TAIL_AFTER).length - 1, 1);
	}
});

test('refuses a dist whose anchors moved', (t) => {
	const temp = fixture(t);
	const path = file(temp, 'esm');
	writeFileSync(
		path,
		readFileSync(path, 'utf8').replace(TAIL, TAIL.replace('"COMMIT"', '"COMMITTED"'))
	);
	assert.throws(() => preparePatch(path), /anchor missing/);
});

// The reason for the patch: a handler that throws must count the write out, so close() can finish.
async function instanceThatFailsInserts(dist, base) {
	const mod = await import(pathToFileURL(file(base, dist)).href);
	const { RxStorageInstanceSQLite } = mod;
	const statements = [];
	const sqliteBasics = {
		run: async (_db, q) => {
			statements.push(q.query.trim().split(/\s+/)[0]);
			if (q.query.includes('INSERT')) throw new Error('Error code 0: not an error');
		},
		all: async () => [],
	};
	const schema = {
		version: 0,
		primaryKey: 'id',
		type: 'object',
		properties: { id: { type: 'string', maxLength: 100 } },
		required: ['id'],
	};
	const instance = new RxStorageInstanceSQLite(
		{ settings: { sqliteBasics } },
		'db',
		'products',
		schema,
		{ databasePromise: Promise.resolve({}), indexCreationPromise: Promise.resolve() },
		{},
		{},
		'"products-0"',
		false
	);
	return { instance, statements };
}
const row = {
	document: { id: 'a', _rev: '1-a', _deleted: false, _meta: { lwt: 1 }, _attachments: {} },
};

for (const dist of ['esm']) {
	test(`${dist}: after a failed bulkWrite the write is counted out and close() settles`, async () => {
		const { instance, statements } = await instanceThatFailsInserts(dist, root);
		await assert.rejects(instance.bulkWrite([row], 'test'), /not an error/);
		assert.equal(instance.openWriteCount$.getValue(), 0, 'openWriteCount$ back to 0');
		assert.ok(
			statements.includes('ROLLBACK;') || statements.includes('ROLLBACK'),
			`rolled back: ${statements}`
		);
		const closed = await Promise.race([
			instance.close().then(() => 'closed'),
			new Promise((resolve) => setTimeout(() => resolve('still pending'), 500)),
		]);
		assert.equal(closed, 'closed');
	});

	test(`${dist}: the "already closed" throw still counts out exactly once`, async () => {
		const { instance } = await instanceThatFailsInserts(dist, root);
		instance.closed = true;
		await assert.rejects(instance.bulkWrite([row], 'test'), /already closed/);
		assert.equal(instance.openWriteCount$.getValue(), 0);
	});
}
