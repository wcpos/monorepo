import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { withTargetedOpfsRecovery } from './opfs-targeted-recovery.mjs';
import { preparePatch as replayPatch } from './patch-rxdb-premium-changelog-replay-safety.mjs';
import {
	DISTS as identityDists,
	preparePatch as identityPatch,
} from './patch-rxdb-premium-changelog-identity.mjs';
import { preparePatch as batchPatch } from './patch-rxdb-premium-cleanup-compaction-batch.mjs';

const require = createRequire(import.meta.url);
const premiumRoot = dirname(require.resolve('rxdb-premium/package.json'));
const { fillWithDefaultSettings } = require('rxdb');
const schema = fillWithDefaultSettings({
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: { id: { type: 'string', maxLength: 32 }, value: { type: 'string' } },
	required: ['id', 'value'],
	indexes: [],
});

// Read the patcher's actual literals, not a reimplementation of compaction.
// DISTS is private in these two scripts; evaluate only their constant section.
function patchSpecs(name) {
	const source = readFileSync(new URL(name, import.meta.url), 'utf8');
	const constants = source.slice(
		source.indexOf('export const MARKER'),
		source.indexOf('export function preparePatch')
	);
	return Function(constants.replaceAll('export ', '') + '\nreturn DISTS;')();
}

function copiedRuntime(root) {
	const dist = join(root, 'runtime');
	cpSync(join(premiumRoot, 'dist/cjs'), dist, { recursive: true });
	symlinkSync(dirname(premiumRoot), join(dist, 'node_modules'), 'dir');
	const directory = join(dist, 'plugins/storage-abstract-filesystem');
	const replay = patchSpecs('./patch-rxdb-premium-changelog-replay-safety.mjs').find(
		(d) => d.dist === 'cjs'
	);
	for (const patch of replay.files) {
		const path = join(directory, patch.file);
		let source = readFileSync(path, 'utf8');
		// The supplied parent install has replay v1, not this checkout's v3.
		// Restore only v1's three literal rewrites in the TEMP COPY before applying
		// the current patch. Never alter the shared node_modules or patch scripts.
		if (source.includes('WCPOS_CHANGELOG_REPLAY_SAFETY_PATCH=1;')) {
			source = source.slice(source.indexOf('Object.defineProperty'));
			if (patch.file === 'helpers.js') {
				source = source.replace(
					/if\(await y\.getSize\(\)>0\)\{.*?\}var v=i\.multiInstance/s,
					patch.rewrites[0].before + 'var v=i.multiInstance'
				);
			} else if (patch.file === 'cleanup.js') {
				source = source.replace(
					/async function g\(.*?(?=async function d\()/s,
					patch.rewrites.find((r) => r.name === 'stampBeforeBake').before
				);
			} else {
				source = source.replace(
					'n=await i.read(0),s=t.storageInstance._decode(n);this.__wcposLastRaw=s;var o=new Map',
					patch.rewrites[0].before
				);
			}
			writeFileSync(path, source);
		}
		const result = replayPatch(path, patch);
		if (result.next) writeFileSync(path, result.next);
	}
	for (const patch of identityDists.filter((d) => d.dist === 'cjs')) {
		const path = join(directory, patch.file);
		const result = identityPatch(path, patch);
		if (result.next) writeFileSync(path, result.next);
	}
	// This monorepo script is byte-identical to the Electron batch patch.
	const batch = patchSpecs('./patch-rxdb-premium-cleanup-compaction-batch.mjs').find(
		(d) => d.dist === 'cjs'
	);
	for (const patch of batch.files) {
		const path = join(directory, patch.file);
		const result = batchPatch(path, patch);
		if (result.next) writeFileSync(path, result.next);
	}
	return require(join(dist, 'plugins/storage-filesystem-node/index.js'));
}

for (const scenario of [
	'single instance',
	'window and partial tail',
	'post-boot write',
	'truncate throws',
	'short-gap write throws',
	'other instance compacts',
]) {
	test(`first cleanup preserves the rebuilt credential: ${scenario}`, async (t) => {
		const root = mkdtempSync(join(tmpdir(), 'wcpos-first-cleanup-'));
		const instances = [];
		const events = [],
			rebuilds = [],
			initialErrors = [];
		const hooks = [globalThis.__wcposOnStorageRecovery, globalThis.__wcposOnIndexRebuild];
		globalThis.__wcposOnStorageRecovery = (event) => events.push(event);
		globalThis.__wcposOnIndexRebuild = (event) => rebuilds.push(event);
		try {
			const runtime = copiedRuntime(root);
			const params = {
				databaseName: 'first-cleanup',
				collectionName: 'wp_credentials',
				schema,
				options: {},
				multiInstance: false,
				devMode: false,
			};
			const open = async (token, recovering = false) => {
				const storage = runtime.getRxStorageFilesystemNode({ basePath: root });
				const instance = await storage.createStorageInstance({
					...params,
					databaseInstanceToken: token,
				});
				instances.push(instance);
				await instance.internals.statePromise;
				if (!recovering) return instance;
				const cleanup = instance.cleanup.bind(instance);
				instance.cleanup = async (...args) => {
					try {
						return await cleanup(...args);
					} catch (error) {
						initialErrors.push(String(error));
						throw error;
					}
				};
				return withTargetedOpfsRecovery({
					createStorageInstance: async () => instance,
				}).createStorageInstance(params);
			};
			const old = await open('old-process');
			const document = (revision, value) => ({
				id: 'login',
				value,
				_deleted: false,
				_rev: `${revision}-fixture`,
				_meta: { lwt: 1000 + revision },
				_attachments: {},
			});
			const previous = document(1, 'é漢😀 old');
			let expected = document(2, 'é漢😀 new');
			assert.deepEqual((await old.bulkWrite([{ document: previous }], 'seed')).error, []);
			await old.taskQueue.awaitIdle();
			while (!(await old.cleanup(0))) {
				/* bake the initial row */
			}
			assert.deepEqual(
				(await old.bulkWrite([{ previous, document: expected }], 'refresh')).error,
				[]
			);
			await old.taskQueue.awaitIdle();
			// Bake the update, but leave its old bytes as a gap for compaction.
			assert.equal(await old.cleanup(0), false);
			await old.taskQueue.awaitIdle();
			const state = await old.internals.statePromise;
			const documentsPath = state.documentFileHandle.filepath;
			const changelogPath = (await state.changelog.fileHandlePromise).filepath;
			if (scenario === 'window and partial tail') {
				// Start a UTF-8 record 20 bytes before the actual 8 MiB scan boundary;
				// include whitespace left by compaction and an incomplete final record.
				writeFileSync(
					documentsPath,
					Buffer.concat([
						Buffer.alloc(8 * 1024 * 1024 - 20 - Buffer.byteLength(JSON.stringify(previous)), 32),
						readFileSync(documentsPath),
						Buffer.from('    {"id":"unfinished'),
					])
				);
			}
			if (scenario === 'short-gap write throws') {
				writeFileSync(documentsPath, '        ' + JSON.stringify(expected));
			}
			// Model the reported boot trigger, NOT hollow bytes or stale offsets.
			writeFileSync(changelogPath, JSON.stringify([1, 0, 'D', ['absent-key', 0, 1]]));
			const boot = await open('new-process', true);
			const bootState = await boot.internals.statePromise;
			assert.deepEqual(
				rebuilds.map((e) => [e.reason, e.documents]),
				[['stale-changelog-op:D:index-1', 1]]
			);
			const before = structuredClone(bootState.firstIdx.rows[0]);
			const bytes = readFileSync(documentsPath);
			assert.deepEqual(JSON.parse(bytes.subarray(before[1], before[2])), expected);
			assert.deepEqual(await boot.findDocumentsById(['login'], false), [expected]);
			assert.ok(before[1] > 0, 'the rebuilt row has a real, byte-correct gap before it');
			if (scenario === 'window and partial tail') assert.equal(before[1], 8 * 1024 * 1024 - 20);

			if (scenario === 'post-boot write') {
				const previous = expected;
				expected = document(3, 'é漢😀 refreshed');
				assert.deepEqual(
					(await boot.bulkWrite([{ previous, document: expected }], 'refresh')).error,
					[]
				);
				await boot.taskQueue.awaitIdle();
				assert.deepEqual(await boot.findDocumentsById(['login'], false), [expected]);
			}
			if (scenario === 'other instance compacts') {
				// Two independent single-instance stores, as in separate Electron mains.
				// Even fully SERIAL execution loses the row: no I/O failure is injected.
				assert.equal(await old.cleanup(0), false);
				await old.taskQueue.awaitIdle();
				const moved = readFileSync(documentsPath);
				assert.deepEqual(
					JSON.parse(moved),
					expected,
					'other instance successfully moved the document'
				);
				assert.ok(before[1] >= moved.length, 'boot offsets now start at/past EOF');
				assert.deepEqual(bootState.firstIdx.rows[0], before, 'boot instance never learns the move');
			}
			if (scenario === 'truncate throws') {
				const prototype = runtime.NodeFilesystemFileSyncAccessHandle.prototype;
				const truncate = prototype.truncate;
				let failed = false;
				prototype.truncate = function (size) {
					if (!failed && this.fileHandle.filepath === documentsPath) {
						failed = true;
						throw new Error('test: truncate failed after document moves');
					}
					return truncate.call(this, size);
				};
				t.after(() => {
					prototype.truncate = truncate;
				});
			}
			if (scenario === 'short-gap write throws') {
				const prototype = runtime.NodeFilesystemWritable.prototype;
				const write = prototype.write;
				let writes = 0;
				prototype.write = function (...args) {
					if (this.accessHandle.fileHandle.filepath === documentsPath && ++writes === 2) {
						throw new Error('test: write failed after whitespace fill and interim rows');
					}
					return write.apply(this, args);
				};
				t.after(() => {
					prototype.write = write;
				});
			}
			// First storage cleanup after this boot; no 60-second wall-clock wait is
			// needed to exercise the timer's target method and its catch/retry path.
			if (scenario === 'other instance compacts') {
				// This instance's rows are stale relative to a file another writer
				// compacted and baked. Recovery must refuse them, never drop them: the
				// stale instance fails loudly and the baked index stays authoritative.
				await assert.rejects(boot.cleanup(0), /range-past-eof/);
				await boot.taskQueue.awaitIdle();
				// A read must not serve the live row as absent either: that is the
				// logout. It fails the same way until the instance restarts.
				await assert.rejects(boot.findDocumentsById(['login'], false), /range-past-eof/);
				await boot.taskQueue.awaitIdle();
				const kinds = events.map((e) => `${e.kind}:${e.reason ?? ''}`).join(' ');
				assert.ok(
					!events.some((e) => e.kind === 'hollow-row-dropped'),
					`no row may be dropped past EOF: ${kinds}`
				);
				assert.ok(
					events.some((e) => e.kind === 'hollow-row-refused' && e.reason === 'range-past-eof'),
					`the refusal is reported by reason: ${kinds}`
				);
				assert.deepEqual(
					JSON.parse(readFileSync(documentsPath)),
					expected,
					'the document bytes stay at the moved position'
				);
				const indexFile = (await bootState.firstIdx.fileHandlePromise).filepath;
				assert.ok(
					readFileSync(indexFile, 'utf8').includes('login'),
					'the baked primary index still holds the row'
				);
				const reopened = await open('third-process');
				assert.deepEqual(
					await reopened.findDocumentsById(['login'], false),
					[expected],
					'a fresh instance reads the row where the other instance moved it'
				);
				return;
			}
			await boot.cleanup(0);
			await boot.taskQueue.awaitIdle();
			const actual = await boot.findDocumentsById(['login'], false);
			t.diagnostic(
				JSON.stringify({
					scenario,
					rebuiltRange: before.slice(1),
					fileBytes: readFileSync(documentsPath).length,
					initialErrors,
					events: events.map((e) => ({ kind: e.kind, id: e.id })),
					remaining: actual.length,
				})
			);
			assert.deepEqual(actual, [expected], 'the live login row must survive its first cleanup');
		} finally {
			for (const instance of instances.reverse()) await instance.close();
			[globalThis.__wcposOnStorageRecovery, globalThis.__wcposOnIndexRebuild] = hooks;
			rmSync(root, { recursive: true, force: true });
		}
	});
}
