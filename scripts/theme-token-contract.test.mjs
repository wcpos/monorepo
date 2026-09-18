import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const css = readFileSync(new URL('../apps/main/global.css', import.meta.url), 'utf8').replace(
	/\/\*[\s\S]*?\*\//g,
	''
);

test('the token sheet does not declare retired colors or duration', () => {
	const retired = css.match(
		/--(?:(?:color-)?(?:tertiary|error)(?:-foreground)?|duration-750)\s*:/g
	);
	assert.equal(retired, null, `Retired declarations: ${retired?.join(', ')}`);
});

test('the theme exposes radius-md to rounded utilities', () => {
	const themes = [...css.matchAll(/@theme\b[^{}]*\{([^{}]*)\}/g)];
	assert.ok(themes.some(([, body]) => /--radius-md\s*:/.test(body)));
});

// A class-string grep missed `useCSSVariable('--color-error')` in pulse-row.tsx on the
// first cut of this PR (caught in review). Imperative reads of a token are consumers
// too, so the retired names are banned from source, not only from the sheet.
const RETIRED_IN_SOURCE = /--(?:color-)?(?:tertiary|error)(?:-foreground)?\b|duration-750/;
const SOURCE_ROOTS = ['apps/main', 'packages/components/src', 'packages/core/src'];
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|css)$/;

function* walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else if (SOURCE_EXT.test(entry.name)) yield full;
	}
}

test('no source file reads a retired token by name', () => {
	const repoRoot = fileURLToPath(new URL('..', import.meta.url));
	const offenders = [];
	for (const root of SOURCE_ROOTS) {
		for (const file of walk(join(repoRoot, root))) {
			if (file.endsWith('global.css')) continue;
			const text = readFileSync(file, 'utf8');
			if (RETIRED_IN_SOURCE.test(text)) offenders.push(relative(repoRoot, file));
		}
	}
	assert.deepEqual(offenders, []);
});
