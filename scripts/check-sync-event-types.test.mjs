import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
	checkSyncEventTypes,
	diffVocabulary,
	MENTION_ONLY_FILES,
	TELEMETRY_PATH,
	unionTypesIn,
} from './check-sync-event-types.mjs';

const temporaryDirectories = [];

function fixture(contents) {
	const directory = mkdtempSync(path.join(tmpdir(), 'wcpos-sync-event-types-'));
	temporaryDirectories.push(directory);
	const file = path.join(directory, 'telemetry.ts');
	writeFileSync(file, contents);
	return file;
}

after(() => {
	for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

describe('unionTypesIn', () => {
	it('reads every member of the union', () => {
		assert.deepEqual(
			unionTypesIn("export type SyncEventType =\n\t| 'a.one'\n\t| 'a.two'\n\t| 'b.three';\n"),
			['a.one', 'a.two', 'b.three']
		);
	});

	it('ignores dotted names written in comments inside the union', () => {
		const source = [
			'export type SyncEventType =',
			"\t// dropped in 1.11: 'a.gone'",
			"\t| 'a.one'",
			"\t/* 'a.never' */",
			"\t| 'a.two';",
			'',
		].join('\n');
		assert.deepEqual(unionTypesIn(source), ['a.one', 'a.two']);
	});

	it('stops at the end of the declaration', () => {
		const source = "export type SyncEventType = 'a.one';\nconst other = 'b.two';\n";
		assert.deepEqual(unionTypesIn(source), ['a.one']);
	});

	it('refuses a source with no union rather than reporting an empty vocabulary', () => {
		assert.throws(() => unionTypesIn('export type Something = string;\n'), /No .* declaration/);
	});
});

describe('diffVocabulary', () => {
	const emitted = (entries) => new Map(entries);

	it('reports a type emitted by the engine but missing from the union', () => {
		const result = diffVocabulary(emitted([['a.one', ['packages/sync-engine/src/lane.ts']]]), [
			'a.two',
		]);
		assert.deepEqual(result.missing, ['a.one']);
		assert.deepEqual(result.unemitted, ['a.two']);
	});

	it('does not count a mention-only file as an emitter', () => {
		// Every member of the union appears in the union itself and in the observer's
		// conformance table; if those counted, "declared but emitted nowhere" could
		// never fire and a stale row would live forever.
		const observer = [...MENTION_ONLY_FILES][1];
		const result = diffVocabulary(emitted([['a.one', [observer]]]), ['a.one']);
		assert.deepEqual(result.missing, []);
		assert.deepEqual(result.unemitted, ['a.one']);
	});

	it('reports a member listed twice', () => {
		const result = diffVocabulary(emitted([]), ['a.one', 'a.one']);
		assert.deepEqual(result.duplicates, ['a.one']);
	});
});

describe('checkSyncEventTypes', () => {
	it('passes against the real telemetry union', async () => {
		await checkSyncEventTypes(TELEMETRY_PATH);
	});

	it('fails when the union drops a type the engine still emits', async () => {
		const source = "export type SyncEventType = 'apply.pull';\n";
		await assert.rejects(() => checkSyncEventTypes(fixture(source)), /emitted but not declared/);
	});
});
