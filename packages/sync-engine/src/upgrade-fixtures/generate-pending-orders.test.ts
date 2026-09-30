// @vitest-environment node
/**
 * GENERATOR for the rxdb 17.4.0 → 17.5.0 pending-orders fixture (PR #2253).
 *
 * The fixture must be WRITTEN by the real 17.4.0 code, never by hand: run this
 * in a worktree (branch or detached) with rxdb + rxdb-premium 17.4.0 installed, with
 * WCPOS_GENERATE_UPGRADE_FIXTURE=1, then copy `rxdb-17.4.0-pending-orders/` into
 * the tree under test. Without the env var it is skipped. The reader is
 * `../rxdb-upgrade-pending-orders.test.ts`.
 */
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { RXDB_VERSION, type RxStorage } from 'rxdb';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { getRxStorageSQLite, getSQLiteBasicsNodeNative } from 'rxdb-premium/plugins/storage-sqlite';

import { createFakeWriteServer } from '@wcpos/sync-core/testing';
import { scopeDatabaseName, type StoreScopeIdentity } from '@wcpos/sync-core';

import { createEngineHarness, remoteId } from '../testing';
import { queueFor } from '../write-path/write-intents';

const require = createRequire(import.meta.url);
const { getRxStorageFilesystemNode } =
	require('rxdb-premium/plugins/storage-filesystem-node') as typeof import('rxdb-premium/plugins/storage-filesystem-node');

type Json = Record<string, unknown>;
const OUT = fileURLToPath(new URL('./rxdb-17.4.0-pending-orders/', import.meta.url));
const SITE = 'https://upgrade-fixture.example.test';
const IDENTITY: StoreScopeIdentity = { site: SITE, storeId: 7, cashierId: 'till-1' };
const T0 = Date.parse('2026-09-30T08:00:00.000Z');
const DRAIN_AT = T0 + 60 * 60_000; // an hour later: every backoff and lease has passed
const uuid = (n: number) => `17400000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CASES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;
type Case = (typeof CASES)[number];
const ORDER = Object.fromEntries(CASES.map((key, i) => [key, uuid(i + 1)])) as Record<Case, string>;
const outcome = (key: Case) =>
	'abcd'.includes(key) ? 'send-once' : key === 'e' ? 'held' : 'not-sent';
const SEED_D = { id: 4104, revision: 'sha256:d-r1' };
const SERVER_G = { id: 4107, revision: 'sha256:g-r1' };

function sqliteStorage(file: string, databaseName: string): RxStorage<unknown, unknown> {
	const basics = getSQLiteBasicsNodeNative(DatabaseSync);
	const open = basics.open;
	basics.open = async (name: string) => {
		if (name !== databaseName) throw new Error(`unexpected sqlite database ${name}`);
		return open(file);
	};
	return getRxStorageSQLite({ sqliteBasics: basics }) as RxStorage<unknown, unknown>;
}

function headSha(): string {
	let dir = process.cwd();
	while (!fs.existsSync(join(dir, '.git'))) dir = dirname(dir);
	const dotGit = join(dir, '.git');
	const gitDir = fs.statSync(dotGit).isFile()
		? fs.readFileSync(dotGit, 'utf8').replace('gitdir:', '').trim()
		: dotGit;
	const head = fs.readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
	if (!head.startsWith('ref: ')) {
		if (!/^[0-9a-f]{40}$/.test(head)) throw new Error(`unreadable HEAD ${head}`);
		return head;
	}
	const ref = head.slice('ref: '.length);
	// A linked worktree keeps its branch refs in the common git dir; packed ones in packed-refs.
	const commonFile = join(gitDir, 'commondir');
	const common = fs.existsSync(commonFile)
		? resolve(gitDir, fs.readFileSync(commonFile, 'utf8').trim())
		: gitDir;
	if (fs.existsSync(join(common, ref))) return fs.readFileSync(join(common, ref), 'utf8').trim();
	const packed = fs.readFileSync(join(common, 'packed-refs'), 'utf8').split('\n');
	const line = packed.find((entry) => entry.endsWith(` ${ref}`));
	if (!line) throw new Error(`cannot resolve ${ref}`);
	return line.split(' ')[0];
}

/** A resident order, shaped as the write-path tests insert them. */
function order(id: string, status: string, server?: { id: number; revision: string }): Json {
	const uuidMeta = [{ key: '_woocommerce_pos_uuid', value: id }];
	return {
		posUserId: '',
		posStoreId: '',
		uuid: id,
		remoteId: server ? remoteId(server.id) : null,
		remoteKey: server ? String(server.id) : '',
		number: server ? String(server.id) : '',
		dateCreatedGmt: '2026-09-30T08:00:00',
		status,
		total: '12.50',
		customerId: 0,
		payload: { ...(server && { id: server.id }), status, total: '12.50', meta_data: uuidMeta },
		sync: server
			? { revision: server.revision, partial: false, source: 'woo-rest' }
			: { revision: '', partial: false, source: 'skeleton' },
		local: { dirty: false, pendingMutationIds: [] },
	};
}

/** Write every case through the engine's own write path; returns what it stored. */
async function writeCases(storage: RxStorage<unknown, unknown>) {
	// The server never applies anything: it refuses (f) and (g), then goes offline.
	const faults = createFakeWriteServer();
	faults.script((env) => {
		if (env.recordId === ORDER.f) return { kind: 'invalid_param', code: 'rest_invalid_email' };
		if (env.recordId !== ORDER.g) return undefined;
		return { kind: 'conflict', current: { id: SERVER_G.id }, currentRevision: 'sha256:g-r2' };
	});
	let online = true;
	let minted = 100;
	const harness = await createEngineHarness({
		site: SITE,
		identity: IDENTITY,
		storage,
		startAtMs: T0,
		fetch: async (url, init) => {
			if (!url.includes('/push/'))
				return Response.json({ changes: [], complete: true, documents: [] });
			if (!online) throw new TypeError('offline');
			return faults.fetch(url, init as never);
		},
		ports: { uuid: () => uuid(minted++) },
	});
	const { engine } = harness;
	const orders = harness.collection('orders');
	const write = (operation: 'create' | 'update', recordId: string, payload: Json) =>
		engine.write({ collection: 'orders', operation, recordId, payload });
	const create = async (id: string, status: string) => {
		await orders.insert(order(id, status) as never);
		return write('create', id, { status });
	};
	const update = { status: 'completed', customer_note: 'from 17.4.0' };
	try {
		await orders.insert(order(ORDER.d, 'processing', SEED_D) as never);
		await orders.insert(order(ORDER.g, 'processing', SERVER_G) as never);
		// (f) a create the server permanently refuses → rejected; (g) an update that
		// conflicts past the one automatic recovery → conflicted.
		await create(ORDER.f, 'processing');
		await write('update', ORDER.g, update);
		const refused = await engine.sync('write-drain');
		expect(refused).toMatchObject({ pushed: 0, rejected: 1, conflicts: 1 });
		online = false;
		// (b) a paid create whose push failed on the network → attempts 1, backoff.
		harness.clock.advance(1_000);
		await create(ORDER.b, 'processing');
		expect(await engine.sync('write-drain')).toMatchObject({ pushed: 0, failed: 1 });
		// (c) a paid create claimed by a drain that then died; its lease runs out.
		harness.clock.advance(1_000);
		const { mutationId } = await create(ORDER.c, 'processing');
		const queue = queueFor(engine.active()!.database);
		const row = (await queue.all()).find((item) => item.mutationId === mutationId)!;
		const until = new Date(T0 + 62_000).toISOString();
		const claimed = {
			...row,
			status: 'claimed' as const,
			claimedBy: 'dead-drain',
			claimedUntil: until,
		};
		expect(await queue.claim(claimed, harness.clock.now())).toBe(true);
		// (a) a paid create never pushed; (d) an update against the server's revision;
		// (e) an open cart's non-explicit create, which the drain holds.
		await create(ORDER.a, 'completed');
		await write('update', ORDER.d, update);
		await create(ORDER.e, 'pos-open');
		harness.clock.advance(10 * 60_000);
		const stored: Partial<Record<Case, Json>> = {};
		for (const key of CASES) stored[key] = (await orders.findOne(ORDER[key]).exec())!.toJSON();
		const rows = (await queue.all()).sort((x, y) => (x.seq ?? 0) - (y.seq ?? 0)) as Json[];
		expect(faults.applied.size).toBe(0);
		const statuses = 'rejected,conflicted,pending,claimed,pending,pending,pending';
		expect(rows.map((item) => item.status).join()).toBe(statuses);
		return { orders: stored as Record<Case, Json>, rows };
	} finally {
		await harness.dispose();
	}
}

/** `{ relativePath: text }` for every file under `base`; every file must be text. */
function serialiseTree(base: string, dir = base, files: Record<string, string> = {}) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries.sort((x, y) => x.name.localeCompare(y.name))) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) serialiseTree(base, path, files);
		else {
			const raw = fs.readFileSync(path);
			const text = raw.toString('utf8');
			expect(Buffer.from(text, 'utf8').equals(raw), `${path} is not text`).toBe(true);
			files[relative(base, path)] = text;
		}
	}
	return files;
}

const generate = process.env.WCPOS_GENERATE_UPGRADE_FIXTURE === '1';
const describeGenerator = generate ? describe : describe.skip;

describeGenerator('rxdb 17.4.0 fixture generator (WCPOS_GENERATE_UPGRADE_FIXTURE=1)', () => {
	it('writes every pending-order case on filesystem-node and sqlite', async () => {
		setPremiumFlag();
		const rxdbPremium = (require('rxdb-premium/package.json') as { version: string }).version;
		expect([String(RXDB_VERSION), rxdbPremium]).toEqual(['17.4.0', '17.4.0']);
		const databaseName = scopeDatabaseName(IDENTITY);
		const work = fs.mkdtempSync(join(tmpdir(), 'rxdb-174-fixture-'));
		try {
			const fsBase = join(work, 'filesystem-node');
			const sqliteFile = join(work, 'sqlite.sqlite');
			const fromFs = await writeCases(getRxStorageFilesystemNode({ basePath: fsBase }) as never);
			const fromSqlite = await writeCases(sqliteStorage(sqliteFile, databaseName));
			expect(fromSqlite).toEqual(fromFs);
			expect(fs.readdirSync(work).sort()).toEqual(['filesystem-node', 'sqlite.sqlite']); // no WAL
			const files = serialiseTree(fsBase);
			const changelogs = Object.keys(files).filter((path) => path.endsWith('changelog.txt'));
			expect(changelogs.some((path) => files[path].trim() !== '')).toBe(true);

			const caseOf = (id: unknown) => CASES.find((key) => ORDER[key] === id)!;
			const manifest = {
				writer: { rxdb: String(RXDB_VERSION), rxdbPremium, sourceCommit: headSha() },
				identity: IDENTITY,
				databaseName,
				drainAtMs: DRAIN_AT,
				orders: CASES.map((key) => ({
					case: key,
					uuid: ORDER[key],
					expected: outcome(key) === 'send-once' ? 'sent' : 'unchanged',
					stored: fromFs.orders[key],
				})),
				queue: fromFs.rows.map((row) => ({
					case: caseOf(row.recordId),
					mutationId: row.mutationId,
					seq: row.seq,
					status: row.status,
					entity: row.collectionName,
					uuid: row.recordId,
					operation: row.operation,
					outcome: outcome(caseOf(row.recordId)),
					stored: row,
				})),
				// (d) updates an order the server knows. (c)'s dead drain died before its
				// request left, so the server has no record of it: no seed.
				serverSeed: { [ORDER.d]: SEED_D },
			};
			fs.rmSync(OUT, { recursive: true, force: true });
			fs.mkdirSync(OUT, { recursive: true });
			fs.writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, '\t')}\n`);
			fs.writeFileSync(join(OUT, 'filesystem-node.json'), `${JSON.stringify(files, null, '\t')}\n`);
			fs.copyFileSync(sqliteFile, join(OUT, 'sqlite.sqlite'));
		} finally {
			fs.rmSync(work, { recursive: true, force: true });
		}
	}, 60_000);
});
