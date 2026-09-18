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

const themeBody = [...css.matchAll(/@theme\b[^{}]*\{([^{}]*)\}/g)]
	.map(([, body]) => body).join('\n');
const themeNames = ['light', 'dark', 'ocean', 'sunset', 'monochrome'];
const newColors = [
	'rail', 'rail-foreground', 'rail-border', 'ok', 'ok-bg', 'warn', 'warn-bg',
	'bad', 'bad-bg', 'neutral', 'scrim', 'c1', 'c2', 'c3', 'c4', 'c5',
];
const aliases = {
	sidebar: 'rail', 'sidebar-foreground': 'rail-foreground', 'sidebar-border': 'rail-border',
	success: 'ok', warning: 'warn', attention: 'warn',
	accent: 'muted', 'accent-foreground': 'foreground',
	popover: 'card', 'popover-foreground': 'card-foreground', input: 'card',
	'card-header': 'muted', footer: 'muted', 'table-header': 'muted',
	'table-row': 'card', 'table-row-alt': 'background',
	secondary: 'muted-foreground', 'secondary-foreground': 'card',
	'chart-1': 'c1', 'chart-2': 'c2', 'chart-3': 'c3', 'chart-4': 'c4', 'chart-5': 'c5',
};

test('the seven scale tokens are plain px numbers in @theme', () => {
	for (const token of ['spacing', 'text-base', 'spacing-ctl', 'spacing-row', 'spacing-tile', 'radius', 'text-amt']) {
		assert.match(themeBody, new RegExp(`--${token}\\s*:\\s*\\d+(?:\\.\\d+)?px\\s*;`), token);
	}
});

test('@theme contains no rem units', () => {
	assert.doesNotMatch(themeBody, /[\d.]rem\b/i);
});

test('the sheet does not scale the root to 87.5%', () => {
	assert.doesNotMatch(css, /font-size\s*:\s*87\.5\s*%/);
});

test('new colors are mapped to Tailwind utilities', () => {
	for (const token of newColors) {
		assert.match(themeBody, new RegExp(`--color-${token}\\s*:\\s*var\\(--${token}\\)\\s*;`), token);
	}
});

for (const name of themeNames) {
	test(`${name} declares every new color and legacy alias without a theme radius`, () => {
		const body = css.match(new RegExp(`@variant\\s+${name}\\s*\\{([^{}]*)\\}`))?.[1];
		assert.ok(body, `Missing ${name} theme`);
		for (const token of [...newColors, 'info', 'success-foreground', 'warning-foreground', 'info-foreground', 'attention-foreground', 'action', 'action-foreground']) {
			assert.match(body, new RegExp(`--${token}\\s*:\\s*[^;]+;`), `${name}: ${token}`);
		}
		for (const [alias, target] of Object.entries(aliases)) {
			assert.match(body, new RegExp(`--${alias}\\s*:\\s*var\\(--${target}\\)\\s*;`), `${name}: ${alias}`);
		}
		assert.doesNotMatch(body, /--radius\s*:/);
	});
}

test('both imperative table-row-alt reads still name a mapped token', () => {
	assert.match(themeBody, /--color-table-row-alt\s*:\s*var\(--table-row-alt\)\s*;/);
	for (const file of ['index.tsx', 'pulse-row.tsx']) {
		const source = readFileSync(new URL(`../packages/components/src/table/${file}`, import.meta.url), 'utf8');
		assert.match(source, /useCSSVariable\(\s*\[[^\]]*['"]--color-table-row-alt['"][^\]]*\]/, file);
	}
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
