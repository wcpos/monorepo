import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { fixDistEsmSpecifiers } from './fix-dist-esm-specifiers.mjs';

function fixture(t, files) {
	const dir = mkdtempSync(join(tmpdir(), 'fix-dist-esm-'));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	for (const [name, contents] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, name)), { recursive: true });
		writeFileSync(join(dir, name), contents);
	}
	return dir;
}

for (const quote of ["'", '"']) {
	test(`rewrites file, directory, re-export, dynamic and side-effect imports (${quote})`, (t) => {
		const input = [
			`import value from ${quote}../dep${quote};`,
			`import directory from ${quote}../directory${quote};`,
			`export * from ${quote}../dep${quote};`,
			`export { value } from ${quote}../dep${quote};`,
			`const lazy = import(${quote}../dep${quote});`,
			`import ${quote}../dep${quote};`,
		].join('\n');
		const dir = fixture(t, { 'nested/main.js': input, 'dep.js': '', 'directory/index.js': '' });
		assert.deepEqual(fixDistEsmSpecifiers(dir), { files: 3, rewritten: 1 });
		assert.equal(readFileSync(join(dir, 'nested/main.js'), 'utf8'), input
			.replaceAll('../dep', '../dep.js').replaceAll('../directory', '../directory/index.js'));
	});
}

test('leaves existing JS extensions and bare specifiers unchanged', (t) => {
	const input = "import './a.js'; import './b.mjs'; import './c.cjs';\n" +
		"export * from 'rxdb'; import { x } from '@wcpos/sync-core/testing';";
	const dir = fixture(t, { 'main.js': input });
	assert.deepEqual(fixDistEsmSpecifiers(dir), { files: 1, rewritten: 0 });
	assert.equal(readFileSync(join(dir, 'main.js'), 'utf8'), input);
});

test('adds JSON attributes exactly once and preserves existing attributes', (t) => {
	const input = 'import data from "./data.json";\n' +
		"import './data.json';\nimport other from './data.json' with { type: 'json' };";
	const dir = fixture(t, { 'main.js': input, 'data.json': '{}' });
	assert.deepEqual(fixDistEsmSpecifiers(dir), { files: 1, rewritten: 1 });
	const expected = 'import data from "./data.json" with { type: \'json\' };\n' +
		"import './data.json' with { type: 'json' };\nimport other from './data.json' with { type: 'json' };";
	assert.equal(readFileSync(join(dir, 'main.js'), 'utf8'), expected);
	assert.deepEqual(fixDistEsmSpecifiers(dir), { files: 1, rewritten: 0 });
	assert.equal(readFileSync(join(dir, 'main.js'), 'utf8'), expected);
});

test('rewrites declaration specifiers but leaves JSON declarations unchanged', (t) => {
	const input = "import type { Value } from './dep';\n" +
		"export type Lazy = import('./dep').Value;\nimport data from './data.json';";
	const dir = fixture(t, { 'main.d.ts': input, 'dep.js': '', 'data.json': '{}' });
	fixDistEsmSpecifiers(dir);
	assert.equal(readFileSync(join(dir, 'main.d.ts'), 'utf8'), input.replaceAll('./dep', './dep.js'));
});

test('rejects dynamic JSON imports', (t) => {
	const dir = fixture(t, { 'main.js': "const data = import('./data.json');", 'data.json': '{}' });
	assert.throws(() => fixDistEsmSpecifiers(dir), /main\.js: dynamic JSON import \.\/data\.json/);
});

test('names the file and unresolvable relative specifier', (t) => {
	const dir = fixture(t, { 'main.js': "export * from './missing';" });
	assert.throws(() => fixDistEsmSpecifiers(dir), /main\.js: unresolved relative specifier \.\/missing/);
});
