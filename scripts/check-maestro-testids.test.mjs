import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const script = readFileSync(new URL('./check-maestro-testids.mjs', import.meta.url), 'utf8');

function check(t, flow, source, evaluate) {
	const root = mkdtempSync(path.join(tmpdir(), 'maestro-testids-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const dir of [
		'scripts',
		'apps/main/.maestro/flows',
		'apps/main/.maestro/subflows',
		'packages/core/src',
		'packages/components/src',
		'apps/main/app',
		'packages/core/e2e',
	]) {
		mkdirSync(path.join(root, dir), { recursive: true });
	}
	writeFileSync(path.join(root, 'scripts/check.mjs'), script);
	writeFileSync(path.join(root, 'apps/main/.maestro/flows/test.yml'), flow);
	writeFileSync(path.join(root, 'packages/core/src/test.tsx'), source);
	const result = spawnSync(
		process.execPath,
		evaluate ? ['--input-type=module', '-e', evaluate] : ['scripts/check.mjs'],
		{
			cwd: root,
			encoding: 'utf8',
		}
	);
	assert.ifError(result.error);
	return result;
}

test('checks every literal alternative and reports only the missing one', (t) => {
	const flow = "id: '(x|y)'";
	const present = check(t, flow, '<View testID="x" /><View testID="y" />');
	assert.equal(present.status, 0, present.stderr);
	const missing = check(t, flow, '<View testID="x" />');
	assert.equal(missing.status, 1);
	assert.equal(missing.stderr, '✖ Maestro flows reference testIDs missing from source:\n  - y\n');
});

test('collects ternary results assigned to a testID variable, not its condition', (t) => {
	// pos/products/tiles/product-tile.tsx names its testID this way; flow 10 waits on it.
	const source = `const testID = onDrill === 'yes' ? 'variable-product-tile' : 'product-tile';
return <Pressable testID={testID} />;`;
	const present = check(t, "id: 'product-tile'\nid: 'variable-product-tile'", source);
	assert.equal(present.status, 0, present.stderr);
	const missing = check(t, "id: 'yes'", source);
	assert.equal(missing.status, 1);
	assert.equal(missing.stderr, '✖ Maestro flows reference testIDs missing from source:\n  - yes\n');
});

test('counts an arm only when the arm is the literal, not a quoted call argument', (t) => {
	const source = `const testID = drill ? makeID('suffix') : nested ? 'arm-b' : 'arm-c';`;
	const present = check(t, "id: 'arm-b'\nid: 'arm-c'", source);
	assert.equal(present.status, 0, present.stderr);
	const missing = check(t, "id: 'suffix'", source);
	assert.equal(missing.status, 1);
	assert.equal(
		missing.stderr,
		'✖ Maestro flows reference testIDs missing from source:\n  - suffix\n'
	);
});

test('counts parenthesised and template-literal arms of a testID variable', (t) => {
	const source =
		"const testID = on ? ('active-id') : 'inactive-id';\n" +
		'const rowTestID = left ? `left-${l}` : `right-${r}`;';
	const present = check(t, "id: 'active-id'\nid: 'inactive-id'\nid: 'right-456'", source);
	assert.equal(present.status, 0, present.stderr);
});

test('reads a typed testID variable and starts the arms at the conditional, not at ?. or ??', (t) => {
	const source = `const testID: string = product?.kind === 'cond-a' ? 'typed-a' : 'typed-b';
const otherTestID = (mode ?? 'cond-b') === 'x' ? 'typed-c' : 'typed-d';`;
	const present = check(t, "id: 'typed-a'\nid: 'typed-b'\nid: 'typed-c'\nid: 'typed-d'", source);
	assert.equal(present.status, 0, present.stderr);
	const missing = check(t, "id: 'cond-a'\nid: 'cond-b'", source);
	assert.equal(missing.status, 1);
	assert.equal(
		missing.stderr,
		'✖ Maestro flows reference testIDs missing from source:\n  - cond-a\n  - cond-b\n'
	);
});

test('collects both ternary results without the condition or neighboring expressions', (t) => {
	const source = `<View testID={c === 'fee' ? 'add-fee-dialog' : 'add-discount-dialog'} label={'outside'} />
<View testID={value} label={c ? 'neighbor' : 'other'} />`;
	const present = check(t, "id: 'add-fee-dialog'\nid: 'add-discount-dialog'", source);
	assert.equal(present.status, 0, present.stderr);
	const missing = check(t, "id: 'fee'\nid: 'outside'\nid: 'neighbor'", source);
	assert.equal(missing.status, 1);
	assert.equal(
		missing.stderr,
		'✖ Maestro flows reference testIDs missing from source:\n  - fee\n  - neighbor\n  - outside\n'
	);
});

test('preserves regex-tail and template-literal prefix matching', (t) => {
	const source = '<View testID="store-option-1" /><View testID={`open-order-tab-${id}`} />';
	const result = check(
		t,
		"id: 'store-option-.*'\nid: 'open-order-tab-42'\nid: 'missing-.*'",
		source
	);
	assert.equal(result.status, 1);
	assert.equal(
		result.stderr,
		'✖ Maestro flows reference testIDs missing from source:\n  - missing-.*\n'
	);
});

test('checks every env assignment for a whole-variable id', (t) => {
	const source = '<View testID="ready" />';
	const present = check(t, 'env:\n  READY_ID: ready\nid: "${READY_ID}"', source);
	assert.equal(present.status, 0, present.stderr);
	const missing = check(
		t,
		'env:\n  READY_ID: ready\n  READY_ID: absent\nid: "${READY_ID}"',
		source
	);
	assert.equal(missing.status, 1);
	assert.equal(
		missing.stderr,
		'✖ Maestro flows reference testIDs missing from source:\n  - absent\n'
	);
	const unassigned = check(t, 'id: "${UNKNOWN}"', source);
	assert.equal(unassigned.status, 1);
	assert.equal(
		unassigned.stderr,
		'✖ Maestro flows reference testIDs missing from source:\n  - ${UNKNOWN}\n'
	);
});

test('exports a pure matcher without walking source on import', (t) => {
	const result = check(
		t,
		'id: "absent"',
		'',
		`
		import assert from 'node:assert/strict';
		import { missingTestIds } from './scripts/check.mjs';
		assert.deepEqual(missingTestIds('(x|y)', new Set(['x', 'y']), new Set()), []);
		assert.deepEqual(missingTestIds('(x|y)', new Set(['x']), new Set()), ['y']);
	`
	);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout, '');
});
