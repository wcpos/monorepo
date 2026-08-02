import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
	checkEventLabels,
	collectEmittedEventTypes,
	diffAgainstRegistry,
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

		assert.deepEqual(
			[...emitted.keys()].sort(),
			['apply.pull', 'push.aborted', 'push.error', 'signal.cycle']
		);
	});

	it('ignores test files, which invent event types freely', async () => {
		const directory = fixture({
			'fake.test.ts': "emit({ type: 'totally.made-up' });",
		});

		assert.equal((await collectEmittedEventTypes([directory])).size, 0);
	});

	it('rejects a computed event type, which no registry could enumerate', async () => {
		const directory = fixture({
			'lane.ts': 'deps.diagnostics({ type: `${name}.tick`, level: "info" });',
		});

		await assert.rejects(() => collectEmittedEventTypes([directory]), /Computed event types/);
	});
});

describe('diffAgainstRegistry', () => {
	it('reports emitted types with no label, and labels nothing emits', () => {
		const emitted = new Map([
			['signal.cycle', ['a.ts']],
			['signal.brand-new', ['a.ts']],
		]);

		const { missing, unused } = diffAgainstRegistry(emitted, [
			{ type: 'signal.cycle' },
			{ type: 'signal.retired' },
		]);

		assert.deepEqual(missing, ['signal.brand-new']);
		assert.deepEqual(unused, ['signal.retired']);
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
});
