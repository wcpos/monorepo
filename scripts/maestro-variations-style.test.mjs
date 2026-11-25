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

const SEGMENT = 'products-variations-style-inline';

const block = commands.find((step) =>
	String(step.runFlow?.when?.true ?? '').includes('variationsStyleInline')
)?.runFlow;

/** Every command in the block, nested runFlow branches included, in document order. */
function walk(steps, when = undefined, out = []) {
	for (const step of steps ?? []) {
		out.push({ step, when });
		if (step.runFlow) walk(step.runFlow.commands, step.runFlow.when, out);
	}
	return out;
}

const flat = walk(block?.commands);
const indexOf = (predicate) => flat.findIndex(({ step }) => predicate(step));
const firstInlineTap = indexOf((step) => step.tapOn?.id === SEGMENT);
const closeTap = indexOf((step) => step.tapOn?.id === 'ui-settings-close');

/** The required checked wait for a platform, between the first inline tap and the close. */
function requiredCheckedWait(platform) {
	return flat.find(
		({ step, when }, index) =>
			index > firstInlineTap &&
			index < closeTap &&
			when?.platform === platform &&
			step.extendedWaitUntil?.visible?.id === SEGMENT &&
			step.extendedWaitUntil.optional !== true
	)?.step.extendedWaitUntil;
}

test('ensure-pos-ready has the inline variations block', () => {
	assert.ok(block, 'a runFlow gated on output.variationsStyleInline');
	assert.ok(firstInlineTap >= 0, 'the block taps the inline segment');
	assert.ok(closeTap > firstInlineTap, 'the block closes the dialog after the tap');
});

test('every scroll to the inline segment centres it clear of the footer', () => {
	const scrolls = flat.filter(({ step }) => step.scrollUntilVisible?.element?.id === SEGMENT);
	assert.ok(scrolls.length >= 1, 'at least one scroll to the segment');
	for (const { step } of scrolls) {
		assert.equal(step.scrollUntilVisible.centerElement, true, 'centerElement: true');
	}
});

test('both platforms wait, required, until the segment reads checked before the close', () => {
	for (const platform of ['iOS', 'Android']) {
		assert.ok(requiredCheckedWait(platform), `${platform} has a required checked wait`);
	}
});

test('the iOS checked selector matches only the checked accessibility value', () => {
	const { text, checked } = requiredCheckedWait('iOS').visible;
	assert.equal(checked, undefined, 'no checked: selector on iOS');
	// Maestro text selectors are full-match regexes.
	const value = new RegExp(`^(?:${text})$`);
	assert.ok(value.test('radio button, checked'), `${text} must match the checked state`);
	assert.ok(!value.test('radio button, unchecked'), `${text} must not match the unchecked state`);
});

test('the Android checked selector reads the checked attribute', () => {
	const { text, checked } = requiredCheckedWait('Android').visible;
	assert.equal(checked, true);
	assert.equal(text, undefined, 'no text: selector on Android');
});

test('the flag is recorded last, after the dialog closes', () => {
	const last = block.commands.at(-1);
	assert.match(String(last.evalScript ?? ''), /output\.variationsStyleInline = true/);
	const flag = indexOf((step) =>
		/output\.variationsStyleInline = true/.test(String(step.evalScript ?? ''))
	);
	assert.ok(flag > closeTap, 'the flag is set after ui-settings-close');
});

test('each re-tap branch logs a WCPOS_E2E line', () => {
	const retaps = block.commands.filter((step) => step.runFlow?.when?.notVisible?.id === SEGMENT);
	assert.deepEqual(
		retaps.map((step) => step.runFlow.when.platform).sort(),
		['Android', 'iOS'],
		'one re-tap branch per platform'
	);
	for (const { runFlow } of retaps) {
		assert.ok(
			runFlow.commands.some((step) => /WCPOS_E2E /.test(String(step.evalScript ?? ''))),
			`the ${runFlow.when.platform} re-tap logs`
		);
		assert.ok(
			runFlow.commands.some((step) => step.tapOn?.id === SEGMENT),
			'and taps again'
		);
	}
});
