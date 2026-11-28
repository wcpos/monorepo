import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseAllDocuments } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commands = parseAllDocuments(
	readFileSync(path.join(ROOT, 'apps/main/.maestro/subflows/ensure-pos-ready.yml'), 'utf8')
)
	.at(-1)
	.toJS();
const segment = 'products-variations-style-inline';
const blocks = commands
	.map((step) => step.runFlow)
	.filter((block) => block?.when?.true?.includes('variationsStyleInline'));
const android = blocks.find((block) => block.when.platform === 'Android');
const ios = blocks.find((block) => block.when.platform === 'iOS');

test('there is one inline-variations block per platform', () => {
	assert.deepEqual(blocks.map((block) => block.when.platform).sort(), ['Android', 'iOS']);
	for (const block of blocks) {
		assert.deepEqual(block.when.visible, { id: 'products-settings-button' });
	}
});

test('the Android block is the plain tap #3860 restored', () => {
	assert.deepEqual(android.commands.map((step) => Object.keys(step)), [
		['tapOn'], ['scrollUntilVisible'], ['tapOn'], ['tapOn'], ['evalScript'],
	]);
	assert.ok(!Object.hasOwn(android.commands[1].scrollUntilVisible, 'centerElement'));
});

test('every iOS scroll to the segment is centred', () => {
	function walk(steps) {
		return steps.flatMap((step) => [step, ...walk(step.runFlow?.commands ?? [])]);
	}
	const scrolls = walk(ios.commands)
		.map((step) => step.scrollUntilVisible)
		.filter((scroll) => scroll?.element?.id === segment);
	assert.ok(scrolls.length >= 2);
	for (const scroll of scrolls) {
		assert.equal(scroll.centerElement, true);
	}
});

test('iOS waits, required, until the segment reads checked before the close', () => {
	const waitIndex = ios.commands.findIndex(({ extendedWaitUntil: wait }) =>
		wait?.visible?.id === segment && wait.optional !== true
	);
	assert.ok(waitIndex >= 0);
	assert.ok(waitIndex < ios.commands.findIndex((step) => step.tapOn?.id === 'ui-settings-close'));
	const { visible } = ios.commands[waitIndex].extendedWaitUntil;
	const state = new RegExp('^(?:' + visible.text + ')$');
	assert.match('radio button, checked', state);
	assert.doesNotMatch('radio button, unchecked', state);
	assert.ok(!Object.hasOwn(visible, 'checked'));
});

test('the iOS re-tap logs a WCPOS_E2E line and taps again', () => {
	const retry = ios.commands.find((step) => step.runFlow?.when?.notVisible?.id === segment)?.runFlow;
	assert.ok(retry);
	assert.ok(retry.commands.some((step) => /WCPOS_E2E /.test(step.evalScript ?? '')));
	assert.ok(retry.commands.some((step) => step.tapOn?.id === segment));
});

test('each block records the flag last, after the close', () => {
	for (const block of blocks) {
		assert.match(block.commands.at(-1).evalScript, /output\.variationsStyleInline = true/);
		assert.deepEqual(block.commands.at(-2), { tapOn: { id: 'ui-settings-close' } });
	}
});
