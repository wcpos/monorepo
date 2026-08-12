import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
	checkEventLabels,
	collectEmittedEventTypes,
	diffAgainstRegistry,
	maskLiterals,
	readRegistry,
} from './check-event-labels.mjs';

const temporaryDirectories = [];

function fixture(files) {
	const directory = mkdtempSync(path.join(tmpdir(), 'wcpos-event-labels-'));
	temporaryDirectories.push(directory);
	for (const [name, contents] of Object.entries(files)) {
		writeFileSync(path.join(directory, name), contents);
	}
	return directory;
}

after(() => {
	for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

/**
 * The mask is what lets the `type:`/`level:` scan run on structure rather than
 * on raw text. It has to leave offsets alone and leave brackets balanced — a
 * literal it mis-reads swallows real code, and the scan silently loses emitters.
 */
describe('maskLiterals', () => {
	const balance = (text) =>
		[...text].reduce(
			(depth, char) => depth + ('([{'.includes(char) ? 1 : ')]}'.includes(char) ? -1 : 0),
			0
		);

	it('blanks literal bodies without moving a single offset', () => {
		const source = "const a = { type: 'x.y' }; // type: 'z.w'\n";
		const masked = maskLiterals(source);

		assert.strictEqual(masked.length, source.length);
		assert.strictEqual(masked.indexOf('type:'), source.indexOf('type:'));
		assert.strictEqual(masked, "const a = { type: '   ' };".padEnd(source.length - 1) + '\n');
	});

	for (const [shape, source] of [
		['a regex character class', String.raw`value.replace(/(https?:\/\/)[^/\s@]+@/gi, '$1[X]@');`],
		['a regex returned from an arrow', 'items.filter((url) => /\\/(a|b)\\?/.test(url));'],
		['a JSX closing tag', 'const el = <Text>{count}</Text>;'],
		['a template with braces in its holes', 'const id = `x-${String(n).padStart(2, "0")}`;'],
		['an apostrophe inside a comment', "// don't read this ' as a string\nconst a = { b: 1 };"],
	]) {
		it(`leaves brackets balanced around ${shape}`, () => {
			assert.strictEqual(balance(maskLiterals(source)), 0);
		});
	}
});

describe('collectEmittedEventTypes', () => {
	it('finds types at the type: property, through ternaries and helper arguments', async () => {
		const directory = fixture({
			'emitters.ts': `
				emit({ type: 'signal.cycle', level: 'info' });
				emit({ type: aborted ? 'push.aborted' : 'push.error', level: 'warn' });
				emitCount('apply.pull', 'products', 1, 1);
			`,
		});

		// `apply.pull` reaches the emitter through a helper, so it is only found by
		// the second pass — which needs the `apply` namespace to be known already.
		const emitted = await collectEmittedEventTypes([directory], ['apply.refresh']);

		assert.deepStrictEqual(
			[...emitted.keys()].sort(),
			['apply.pull', 'push.aborted', 'push.error', 'signal.cycle']
		);
	});

	it('ignores test files, which invent event types freely', async () => {
		const directory = fixture({
			'fake.test.ts': "emit({ type: 'totally.made-up' });",
		});

		assert.strictEqual((await collectEmittedEventTypes([directory])).size, 0);
	});

	it('rejects a computed event type, which no registry could enumerate', async () => {
		const directory = fixture({
			'lane.ts': 'deps.diagnostics({ type: `${name}.tick`, level: "info" });',
		});

		await assert.rejects(() => collectEmittedEventTypes([directory]), /Computed event types/);
	});

	// A template literal is the obvious computed type; concatenation, a bare
	// identifier and a `??` fallback mint names just as unenumerable.
	for (const [shape, expression] of [
		['concatenation', "namespace + '.tick'"],
		['an identifier', 'eventType'],
		['a helper call', "makeType('tick')"],
		['a nullish fallback', "override ?? 'signal.cycle'"],
	]) {
		it(`rejects an event type built by ${shape}`, async () => {
			const directory = fixture({
				'lane.ts': `emit({ type: ${expression}, level: 'info' });`,
			});

			await assert.rejects(() => collectEmittedEventTypes([directory]), /Computed event types/);
		});
	}

	it('accepts the literal shapes an emitter really uses', async () => {
		const directory = fixture({
			'emitters.ts': `
				emit({ type: ('signal.cycle'), level: 'info' });
				emit({ type: 'push.outcome' as const, level: report.failed ? 'warn' : 'info' });
				emit({ type: a ? 'push.aborted' : b ? 'push.error' : 'push.conflict', level: 'warn' });
			`,
		});

		assert.deepStrictEqual(
			[...(await collectEmittedEventTypes([directory])).keys()].sort(),
			['push.aborted', 'push.conflict', 'push.error', 'push.outcome', 'signal.cycle']
		);
	});

	// These roots are full of `type:` properties that are not events: RxDB JSON
	// schemas, scope-manager unions, plain TypeScript annotations. Rule 2 keys on
	// the sibling `level`, so none of them may trip it.
	it('leaves computed `type:` properties that are not events alone', async () => {
		const directory = fixture({
			'not-events.ts': `
				const schema = { type: 'object', properties: { wooId: { type: ['number', 'null'] } } };
				interface Envelope { type: string; readonly level: SyncEventLevel }
				const scopeEvent = { type: row.type, level: decayLevel };
				function decorate(type: ScanEventType, level: 'info' | 'warn') {}
			`,
		});

		assert.strictEqual((await collectEmittedEventTypes([directory])).size, 0);
	});

	it('does not read a `type:` written inside a comment, string or regex', async () => {
		const directory = fixture({
			'quoted.ts': [
				'// type: `${lane}.tick` — describing the shape we reject',
				'const doc = "type: `${lane}.tick`";',
				"const brace = /^\\{'[a-z]+\\}$/;",
				"emit({ type: 'signal.cycle', level: 'info' });",
			].join('\n'),
		});

		assert.deepStrictEqual([...(await collectEmittedEventTypes([directory])).keys()], ['signal.cycle']);
	});
});

describe('diffAgainstRegistry', () => {
	it('reports emitted types with no label, and labels nothing emits', () => {
		const emitted = new Map([
			['signal.cycle', ['a.ts']],
			['signal.brand-new', ['a.ts']],
		]);

		const { missing, unused } = diffAgainstRegistry(emitted, [
			{ type: 'signal.cycle', label: 'Checked your store for changes' },
			{ type: 'signal.retired', label: 'Retired' },
		]);

		assert.deepStrictEqual(missing, ['signal.brand-new']);
		assert.deepStrictEqual(unused, ['signal.retired']);
	});

	// A `type` with no label is not coverage — the row renders blank. Counting it
	// as labelled would let `pnpm test:scripts` pass with no merchant-readable copy.
	it('treats an entry with a blank or missing label as unlabelled', () => {
		const emitted = new Map([
			['signal.cycle', ['a.ts']],
			['signal.quiet', ['a.ts']],
			['signal.absent', ['a.ts']],
		]);

		const { missing } = diffAgainstRegistry(emitted, [
			{ type: 'signal.absent' },
			{ type: 'signal.cycle', label: 'Checked your store for changes' },
			{ type: 'signal.quiet', label: '   ' },
		]);

		assert.deepStrictEqual(missing, ['signal.absent', 'signal.quiet']);
	});
});

describe('checkEventLabels', () => {
	it('passes for the repository as it stands', async () => {
		await checkEventLabels();
	});

	it('fails loudly when a new event type ships without a label', async () => {
		const registry = (await readRegistry()).filter((entry) => entry.type !== 'signal.cycle');
		const directory = fixture({ 'registry.json': JSON.stringify(registry) });

		await assert.rejects(
			() => checkEventLabels(path.join(directory, 'registry.json')),
			/signal\.cycle/
		);
	});

	it('fails when an entry keeps its type but empties its label', async () => {
		const registry = (await readRegistry()).map((entry) =>
			entry.type === 'signal.cycle' ? { ...entry, label: '' } : entry
		);
		const directory = fixture({ 'registry.json': JSON.stringify(registry) });

		await assert.rejects(
			() => checkEventLabels(path.join(directory, 'registry.json')),
			/missing required field label/
		);
	});

	it('fails when an optional description is present but empty', async () => {
		const registry = (await readRegistry()).map((entry) =>
			entry.type === 'signal.cycle' ? { ...entry, description: '   ' } : entry
		);
		const directory = fixture({ 'registry.json': JSON.stringify(registry) });

		await assert.rejects(
			() => checkEventLabels(path.join(directory, 'registry.json')),
			/optional field description/
		);
	});
});
