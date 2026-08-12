// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBCleanupPlugin } from 'rxdb/plugins/cleanup';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

const require = createRequire(import.meta.url);
const { getRxStorageFilesystemNode } =
	require('rxdb-premium/plugins/storage-filesystem-node') as typeof import('rxdb-premium/plugins/storage-filesystem-node');

setPremiumFlag();
addRxPlugin(RxDBCleanupPlugin);

/**
 * Guards scripts/patch-rxdb-premium-resurrection-leak.mjs (root postinstall).
 *
 * Re-inserting a soft-deleted primary key ("resurrection") reaches the
 * abstract-filesystem storage as a change event with previousDocumentData
 * null (rxdb core's reInserts conflict retry), so the tombstone's index rows
 * are never removed: one leaked row per delete → re-insert cycle, in every
 * index file. Compaction later drifts the leaked rows' byte offsets into
 * garbage — the production malformed-JSON corruption class (dev-next,
 * 2026-08-12; queryTotalRequestStates held 221 rows for 9 documents).
 *
 * The effective row state a reopen would load = base index files + changelog
 * replay, which is what this test counts. Unpatched, 9 keys × 6 cycles gives
 * 63 rows; patched it stays at the live-document count.
 */

const KEYS = Array.from({ length: 9 }, (_, index) => `census:key-${index}`);
const CYCLES = 6;

const schema = {
	version: 0,
	primaryKey: 'queryKey',
	type: 'object',
	properties: {
		queryKey: { type: 'string', maxLength: 64 },
		status: { type: 'string', maxLength: 16 },
	},
	required: ['queryKey', 'status'],
	indexes: [['status']],
} as const;

let baseDir: string | undefined;
let openDatabase: RxDatabase | undefined;

afterEach(async () => {
	await openDatabase?.close();
	openDatabase = undefined;
	if (baseDir) rmSync(baseDir, { recursive: true, force: true });
	baseDir = undefined;
});

type IndexRow = [string, number, number];
type ChangelogOp = [number, number, 'A' | 'D' | 'R', IndexRow];

/** Base index rows + changelog replay — the state the next open would load. */
function effectiveRows(collectionDir: string, indexId: number): IndexRow[] {
	const raw = readFileSync(
		join(collectionDir, `index-${String(indexId).padStart(5, '0')}.txt`),
		'utf8'
	).trim();
	const rows: IndexRow[] = raw ? JSON.parse(raw) : [];
	const changelog = readFileSync(join(collectionDir, 'changelog.txt'), 'utf8');
	const ops: ChangelogOp[] = changelog.trim() ? JSON.parse(`[${changelog}]`) : [];
	for (const [opIndexId, position, type, row] of ops) {
		if (opIndexId !== indexId) continue;
		if (type === 'A') rows.splice(Math.min(position, rows.length), 0, row);
		else if (type === 'D' && position < rows.length) rows.splice(position, 1);
		else if (type === 'R' && position < rows.length) rows[position] = row;
	}
	return rows;
}

describe('resurrection index-row leak (patched rxdb-premium)', () => {
	it('delete → re-insert cycles do not grow the index files', async () => {
		baseDir = mkdtempSync(join(tmpdir(), 'resurrection-leak-'));
		const db = await createRxDatabase({
			name: join(baseDir, 'db'),
			storage: getRxStorageFilesystemNode({ basePath: baseDir }),
			multiInstance: true,
		});
		openDatabase = db;
		const { states } = await db.addCollections({ states: { schema } });

		for (const key of KEYS) await states.insert({ queryKey: key, status: 'created' });
		for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
			for (const key of KEYS) {
				const live = await states.findOne(key).exec();
				if (live) {
					await live.incrementalPatch({ status: 'done' });
					const settled = await states.findOne(key).exec();
					if (settled) await settled.remove();
				}
				await states.insert({ queryKey: key, status: 'created' });
			}
		}

		// documents stay correct through the public API
		const all = await states.find().exec();
		expect(all.map((doc) => doc.queryKey).sort()).toEqual([...KEYS].sort());

		await db.close();
		openDatabase = undefined;

		const collectionDir = readdirSync(baseDir).find((entry) => entry.includes('-states-0'));
		expect(collectionDir).toBeDefined();
		const dir = join(baseDir, collectionDir!);

		const documents = readFileSync(join(dir, 'documents.json'), 'utf8');
		for (const indexId of [0, 1, 2]) {
			const rows = effectiveRows(dir, indexId);
			// 9 live documents; tombstone rows are legitimate, leaked ones are not.
			// Unpatched this is 63 (9 + 9×6 resurrections).
			expect(rows.length).toBeLessThanOrEqual(KEYS.length * 2);
			// and every surviving row must point at exactly one parseable document
			for (const [, start, end] of rows) {
				expect(end).toBeLessThanOrEqual(documents.length);
				const parsed = JSON.parse(`[${documents.slice(start, end)}]`);
				expect(parsed).toHaveLength(1);
			}
		}
	});
});
