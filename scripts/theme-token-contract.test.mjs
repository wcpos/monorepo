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

const themeBody = [...css.matchAll(/@theme\s*\{([^{}]*)\}/g)].map(([, body]) => body).join('\n');
const inlineThemeBody = [...css.matchAll(/@theme\s+inline\s*\{([^{}]*)\}/g)]
	.map(([, body]) => body)
	.join('\n');

// The type tokens a step scopes directly (scale.ts SCALE_STEPS); every other
// text token derives from these, so it must resolve inline.
const SCALE_TEXT_TOKENS = ['--text-base', '--text-amt', '--text-xs', '--text-2xs'];

test('derived type and radius tokens are inline so scopes recompute them', () => {
	const declarations = /--(?:text-[\w-]+|radius-[\w-]+)\s*:/g;
	const derived = [...css.matchAll(declarations)]
		.map(([declaration]) => declaration.replace(/\s*:$/, ''))
		.filter((token) => !SCALE_TEXT_TOKENS.includes(token));
	assert.ok(derived.length > 0);
	for (const token of derived) {
		const declaration = new RegExp(`${token}\\s*:`);
		assert.match(inlineThemeBody, declaration, `${token} must be inline`);
		assert.doesNotMatch(themeBody, declaration, `${token} must not be in plain @theme`);
	}
});
const themeNames = ['light', 'dark', 'ocean', 'sunset', 'monochrome'];
const newColors = [
	'rail',
	'rail-foreground',
	'rail-border',
	'ok',
	'ok-bg',
	'warn',
	'warn-text',
	'warn-bg',
	'bad',
	'bad-bg',
	'neutral',
	'scrim',
	'c1',
	'c2',
	'c3',
	'c4',
	'c5',
];
const aliases = {
	sidebar: 'rail',
	'sidebar-foreground': 'rail-foreground',
	'sidebar-border': 'rail-border',
	success: 'ok',
	warning: 'warn',
	attention: 'warn',
	accent: 'muted',
	'accent-foreground': 'foreground',
	popover: 'card',
	'popover-foreground': 'card-foreground',
	input: 'card',
	'card-header': 'muted',
	footer: 'muted',
	'table-header': 'muted',
	'table-row': 'card',
	'table-row-alt': 'background',
	secondary: 'muted-foreground',
	'secondary-foreground': 'card',
	'chart-1': 'c1',
	'chart-2': 'c2',
	'chart-3': 'c3',
	'chart-4': 'c4',
	'chart-5': 'c5',
};

test('the nine scale tokens are plain px numbers in @theme', () => {
	for (const token of [
		'spacing',
		'text-base',
		'spacing-ctl',
		'spacing-row',
		'spacing-tile',
		'radius',
		'text-amt',
		'text-xs',
		'text-2xs',
	]) {
		assert.match(themeBody, new RegExp(`--${token}\\s*:\\s*\\d+(?:\\.\\d+)?px\\s*;`), token);
	}
});

// Text a cashier reads is never under 12 px in any step; 2xs is glyph-only and
// 3xs is gone (CODING_STANDARDS.md § Design).
test('the type floor: xs is 12 px, 2xs is 11 px, and there is no 3xs', () => {
	assert.match(themeBody, /--text-xs\s*:\s*12px\s*;/);
	assert.match(themeBody, /--text-2xs\s*:\s*11px\s*;/);
	assert.doesNotMatch(css, /--text-3xs/);
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
		for (const token of [
			...newColors,
			'info',
			'success-foreground',
			'warning-foreground',
			'info-foreground',
			'attention-foreground',
			'action',
			'action-foreground',
		]) {
			assert.match(body, new RegExp(`--${token}\\s*:\\s*[^;]+;`), `${name}: ${token}`);
		}
		for (const [alias, target] of Object.entries(aliases)) {
			assert.match(
				body,
				new RegExp(`--${alias}\\s*:\\s*var\\(--${target}\\)\\s*;`),
				`${name}: ${alias}`
			);
		}
		assert.doesNotMatch(body, /--radius\s*:/);
	});
}

// The token pass (roadmap#357) aliased table-row-alt to the background and kept the two
// imperative reads alive; the overlays tier (roadmap#379) retired the stripe and both reads.
// The alias stays mapped until the housekeeping PR that removes it reads zero consumers.
test('the table-row-alt alias stays mapped and no imperative read names it', () => {
	assert.match(themeBody, /--color-table-row-alt\s*:\s*var\(--table-row-alt\)\s*;/);
	for (const file of ['index.tsx', 'pulse-row.tsx']) {
		const source = readFileSync(
			new URL(`../packages/components/src/table/${file}`, import.meta.url),
			'utf8'
		);
		assert.doesNotMatch(source, /table-row-alt/, file);
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

test('controls share the web keyboard focus outline', () => {
	assert.match(
		css,
		/:focus-visible\s*\{\s*outline: 2px solid var\(--ring\);\s*outline-offset: 2px;/
	);
	assert.match(
		css,
		/:where\(input, textarea, \[contenteditable\]\):focus-visible\s*\{\s*outline: none;/
	);
});

// WCAG 2 contrast of two `oklch(L C h)` tokens, through OKLab to sRGB (clamped to the gamut,
// as a browser paints an out-of-gamut colour).
function oklchLinearRgb(value) {
	const [L, C, h] = value
		.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/)
		.slice(1)
		.map(Number);
	const a = C * Math.cos((h * Math.PI) / 180);
	const b = C * Math.sin((h * Math.PI) / 180);
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	].map((channel) => Math.min(1, Math.max(0, channel)));
}
function luminance([r, g, bl]) {
	return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}
function oklchLuminance(value) {
	return luminance(oklchLinearRgb(value));
}
function luminanceContrast(x, y) {
	const [hi, lo] = [x, y].sort((p, q) => q - p);
	return (hi + 0.05) / (lo + 0.05);
}
function contrast(x, y) {
	return luminanceContrast(oklchLuminance(x), oklchLuminance(y));
}
// Alpha compositing happens in gamma-encoded sRGB, not linear light. Return
// the painted surface's luminance after decoding the blended channels.
function blend(tint, alpha, surface) {
	const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
	const decode = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
	const background = oklchLinearRgb(surface).map(encode);
	return luminance(
		oklchLinearRgb(tint).map((c, i) => decode(alpha * encode(c) + (1 - alpha) * background[i]))
	);
}
function themeToken(body, token) {
	const value = body.match(new RegExp(`--${token}\\s*:\\s*([^;]+);`))?.[1].trim();
	assert.ok(value, `missing --${token}`);
	const alias = value.match(/^var\(--([\w-]+)\)$/)?.[1];
	return alias ? themeToken(body, alias) : value;
}

// Text contrast 4.5:1 (CODING_STANDARDS § Design 7). The light theme's --ok read 4.16:1 under
// its own success-foreground at L 0.55; every success green is drawn from it.
const TEXT_CONTRAST = 4.5;
// Warning washes appear in register-count, legacy-tab, Badge, ListItem, Avatar
// and log-view; destructive/10 with destructive words appears in legacy-tab and log-view.
for (const name of themeNames) {
	for (const [text, tint, alpha] of [
		['warn-text', 'warn', 0.1],
		['warn-text', 'warn', 0.15],
		['destructive', 'destructive', 0.1],
	]) {
		for (const surface of ['card', 'background']) {
			const pair = `${text} on ${tint}/${alpha * 100} over ${surface}`;
			test(`${name}: ${pair} reaches 4.5:1`, () => {
				const body = css.match(new RegExp(`@variant\\s+${name}\\s*\\{([^{}]*)\\}`))?.[1];
				assert.ok(body, `Missing ${name} theme`);
				const ratio = luminanceContrast(
					oklchLuminance(themeToken(body, text)),
					blend(themeToken(body, tint), alpha, themeToken(body, surface))
				);
				assert.ok(ratio >= TEXT_CONTRAST, `${name}: ${pair} is ${ratio.toFixed(2)}:1`);
			});
		}
	}
}

for (const name of themeNames) {
	test(`${name}: success text and the words on a success fill reach 4.5:1`, () => {
		const body = css.match(new RegExp(`@variant\\s+${name}\\s*\\{([^{}]*)\\}`))?.[1];
		assert.ok(body, `Missing ${name} theme`);
		const ok = themeToken(body, 'success');
		for (const [pair, ground] of [
			['success-foreground on success', themeToken(body, 'success-foreground')],
			['text-success on card', themeToken(body, 'card')],
			['text-success on background', themeToken(body, 'background')],
		]) {
			const ratio = contrast(ok, ground);
			assert.ok(ratio >= TEXT_CONTRAST, `${name}: ${pair} is ${ratio.toFixed(2)}:1`);
		}
	});
}

for (const name of themeNames) {
	for (const [text, ground] of [
		['warn-text', 'card'],
		['warn-text', 'background'],
		['destructive-foreground', 'destructive'],
		['action-foreground', 'action'],
		['warning-foreground', 'warn'],
		['info-foreground', 'info'],
		['info', 'card'],
		['info', 'background'],
	]) {
		test(`${name}: ${text} on ${ground} reaches 4.5:1`, () => {
			const body = css.match(new RegExp(`@variant\\s+${name}\\s*\\{([^{}]*)\\}`))?.[1];
			assert.ok(body, `Missing ${name} theme`);
			const ratio = contrast(themeToken(body, text), themeToken(body, ground));
			assert.ok(ratio >= TEXT_CONTRAST, `${name}: ${text} on ${ground} is ${ratio.toFixed(2)}:1`);
		});
	}
}
