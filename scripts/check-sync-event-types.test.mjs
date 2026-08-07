import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
	checkSyncEventTypes,
	conformanceKeysIn,
	diffConformance,
	diffVocabulary,
	MENTION_ONLY_FILES,
	OBSERVER_PATH,
	TELEMETRY_PATH,
	unionTypesIn,
} from './check-sync-event-types.mjs';

const temporaryDirectories = [];

function fixture(contents, name = 'telemetry.ts') {
	const directory = mkdtempSync(path.join(tmpdir(), 'wcpos-sync-event-types-'));
	temporaryDirectories.push(directory);
	const file = path.join(directory, name);
	writeFileSync(file, contents);
	return file;
}

/** An observer file whose table maps exactly `types`. */
const observerFixture = (types) =>
	fixture(
		`const CONFORMANCE_TABLE = {\n${types
			.map((type) => `\t'${type}': { operationType: 'sync.other', outcome: 'failed' },`)
			.join('\n')}\n} satisfies ConformanceTable;\n`,
		'sync-log-observer.ts'
	);

/** The real vocabulary, so an end-to-end run gets past the emitted-types check. */
const realUnion = () => unionTypesIn(readFileSync(TELEMETRY_PATH, 'utf8'));

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

/**
 * The observer's table is checked here as well as by `satisfies` in the source,
 * because apps/main has no typecheck task in CI — this is the copy that blocks.
 */
describe('conformanceKeysIn', () => {
	it('reads the table keys and nothing else', () => {
		const source = [
			'const CONFORMANCE_TABLE = {',
			"\t'a.one': { operationType: 'sync.apply', outcome: 'ok' },",
			"\t'a.two': {",
			"\t\toperationType: 'sync.record',",
			"\t\toutcome: 'failed',",
			// a quoted dotted name in a nested position is an argument, not a key
			"\t\tmessage: recordMessage('b.three'),",
			"\t\tdidWork: (f) => f.status === 'error',",
			'\t},',
			"\t'a.three': INHERITED_DEFAULT,",
			'} satisfies ConformanceTable;',
			'',
		].join('\n');
		assert.deepEqual(conformanceKeysIn(source), ['a.one', 'a.two', 'a.three']);
	});

	it('refuses a source with no table rather than reporting an empty map', () => {
		assert.throws(() => conformanceKeysIn('const OTHER = {};\n'), /No .* declaration/);
	});
});

describe('diffConformance', () => {
	it('reports a declared type with no row, and a row for an unknown type', () => {
		const result = diffConformance(['a.one', 'a.two'], ['a.two', 'a.gone']);
		assert.deepEqual(result.unmapped, ['a.one']);
		assert.deepEqual(result.orphaned, ['a.gone']);
	});

	it('reports a type mapped twice, where the later row silently wins', () => {
		const result = diffConformance(['a.one'], ['a.one', 'a.one']);
		assert.deepEqual(result.duplicates, ['a.one']);
	});
});

describe('checkSyncEventTypes', () => {
	it('passes against the real telemetry union and observer table', async () => {
		await checkSyncEventTypes(TELEMETRY_PATH, OBSERVER_PATH);
	});

	it('fails when the union drops a type the engine still emits', async () => {
		const source = "export type SyncEventType = 'apply.pull';\n";
		await assert.rejects(() => checkSyncEventTypes(fixture(source)), /emitted but not declared/);
	});

	it('fails when a declared type has no conformance row', async () => {
		const observer = observerFixture(realUnion().slice(1));
		await assert.rejects(
			() => checkSyncEventTypes(TELEMETRY_PATH, observer),
			/have no conformance row/
		);
	});

	it('fails when the table maps a type that is not in the vocabulary', async () => {
		const observer = observerFixture([...realUnion(), 'apply.removed-last-release']);
		await assert.rejects(
			() => checkSyncEventTypes(TELEMETRY_PATH, observer),
			/not in\s+SyncEventType/
		);
	});
});
