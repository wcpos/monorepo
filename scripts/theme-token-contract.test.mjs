import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
