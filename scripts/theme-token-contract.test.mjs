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
test('shape, shadow and weight utilities resolve inline', () => {
	const mappings = {
		'radius-control': 'shape-radius-control',
		'radius-tile': 'shape-radius-tile',
		'radius-media': 'shape-radius-media',
		'radius-commit': 'shape-radius-commit',
		'radius-field': 'shape-radius-field',
		'radius-chip': 'shape-radius-chip',
		'shadow-commit': 'shape-commit-shadow',
		'shadow-commit-press': 'shape-commit-shadow-press',
		'font-weight-ui': 'type-w-ui',
		'font-weight-strong': 'type-w-strong',
		'font-weight-commit': 'type-w-commit',
	};
	for (const [utility, token] of Object.entries(mappings)) {
		// A radius is a unitless multiple of --radius applied HERE, where the density scope's --radius is
		// in force; a px token computed in the variant would read the root's 8 (the compact gallery cells
		// moved 15 px before this). Shadows and weights map straight through.
		const value = utility.startsWith('radius-')
			? `calc\\(var\\(--radius\\) \\* var\\(--${token}\\)\\)`
			: `var\\(--${token}\\)`;
		assert.match(inlineThemeBody, new RegExp(`--${utility}\\s*:\\s*${value}\\s*;`), utility);
		assert.doesNotMatch(themeBody, new RegExp(`--${utility}\\s*:`));
	}
});

const themeNames = [
	'light',
	'dark',
	'ocean',
	'sunset',
	'monochrome',
	'paper',
	'warm',
	'bold',
	'market',
];

for (const name of themeNames) {
	test(`${name}: every shape radius is a unitless multiple (999 is a pill or a circle)`, () => {
		const body = css.match(new RegExp(`@variant\\s+${name}\\s*\\{([^{}]*)\\}`))?.[1];
		assert.ok(body, `Missing ${name} theme`);
		for (const token of ['control', 'tile', 'media', 'commit', 'field', 'chip']) {
			const value = body.match(new RegExp(`--shape-radius-${token}\\s*:\\s*([^;]+);`))?.[1].trim();
			assert.ok(value, `${name}: --shape-radius-${token}`);
			assert.match(
				value,
				/^\d+(\.\d+)?$/,
				`${name}: --shape-radius-${token} is ${value}, not a unitless number`
			);
		}
	});
}

test('the contract covers every variant in the theme layer, in sheet order', () => {
	const layer = css.match(/@layer\s+theme\s*\{([\s\S]*?)^\}/m)?.[1];
	assert.ok(layer, 'Missing theme layer');
	const variants = [...layer.matchAll(/@variant\s+([\w-]+)\s*\{/g)].map(([, name]) => name);
	assert.deepEqual(themeNames, variants);
});
const shapeTokens = [
	'shape-rule-style',
	'shape-radius-control',
	'shape-radius-tile',
	'shape-radius-media',
	'shape-radius-commit',
	'shape-radius-field',
	'shape-radius-chip',
	'shape-ctl-border',
	'shape-commit-shadow',
	'shape-commit-shadow-press',
	'shape-commit-press-y',
	'primary-shadow',
	'type-w-ui',
	'type-w-strong',
	'type-w-commit',
	'chip',
	'chip-border',
];

const newColors = [
	'tile-ink',
	'cart',
	'price-chip',
	'price-chip-foreground',
	'chip',
	'chip-border',
	'primary-shadow',
	'selected',
	'selected-foreground',
	// The hover and press wash: a value of its own in light (the accent's step 3, 2026-10-30), an
	// alias of muted in the other themes until their own pass.
	'accent',
	'rail',
	'rail-foreground',
	'rail-border',
	// The rail's active square and its wash (2026-10-30): card + the selected ink in light, the
	// selected tint elsewhere. Three tokens so the construction flips in one place.
	'rail-selected',
	'rail-selected-foreground',
	'rail-accent',
	'ok',
	'ok-bg',
	'warning',
	'warning-text',
	'warning-bg',
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
	attention: 'warning',
	// One red: a state that is bad and an action that destroys are the same colour (card 16).
	bad: 'destructive',
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
		for (const token of shapeTokens) {
			assert.match(body, new RegExp(`--${token}\\s*:\\s*[^;]+;`), `${name}: ${token}`);
		}
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
// `warn*` folded into the `warning` family (card 16): one name per tone.
const RETIRED_IN_SOURCE =
	/--(?:color-)?(?:tertiary|error)(?:-foreground)?\b|--(?:color-)?warn(?:-text|-bg)?\b|\b(?:bg|text|border)-warn(?:-text|-bg)?\b|duration-750/;
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

function oklchToLab(L, C, h) {
	const a = C * Math.cos((h * Math.PI) / 180);
	const b = C * Math.sin((h * Math.PI) / 180);
	return [L, a, b];
}
function labToLinearRgb([L, a, b]) {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
}
function linearRgbToLab([r, g, b]) {
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	];
}
// CSS Color 4 binary-search gamut mapping with local MINDE, targeting sRGB.
// https://www.w3.org/TR/css-color-4/#binsearch
function oklchLinearRgb(value) {
	const [L, C, h] = value
		.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/)
		.slice(1)
		.map(Number);
	if (L >= 1) return [1, 1, 1];
	if (L <= 0) return [0, 0, 0];
	const inGamut = (rgb) => rgb.every((c) => c >= 0 && c <= 1);
	const clip = (rgb) => rgb.map((c) => Math.min(1, Math.max(0, c)));
	const delta = (rgb, lab) => Math.hypot(...linearRgbToLab(rgb).map((c, i) => c - lab[i]));
	const JND = 0.02;
	const epsilon = 0.0001;
	let current = oklchToLab(L, C, h);
	let rgb = labToLinearRgb(current);
	if (inGamut(rgb)) return rgb;
	let clipped = clip(rgb);
	if (delta(clipped, current) < JND) return clipped;
	let min = 0;
	let max = C;
	let minInGamut = true;
	while (max - min > epsilon) {
		const chroma = (min + max) / 2;
		current = oklchToLab(L, chroma, h);
		rgb = labToLinearRgb(current);
		if (minInGamut && inGamut(rgb)) {
			min = chroma;
			continue;
		}
		clipped = clip(rgb);
		const E = delta(clipped, current);
		if (E < JND) {
			if (JND - E < epsilon) return clipped;
			minInGamut = false;
			min = chroma;
		} else {
			max = chroma;
		}
	}
	return clipped;
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

// Pixels measured in Chrome 155 (headless, sRGB canvas, 2026-10-18). The amber words are
// outside the sRGB gamut; a hard clip paints them lighter than the browser's chroma
// reduction does, which is why the mapping is here. L 0.55 is what the round-1 gallery
// baseline shot; L 0.50 is the shipped light --warning-text.
test("gamut mapping matches Chromium's rendered pixels", () => {
	const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
	const warnText55 = oklchLinearRgb('oklch(0.55 0.13 70)').map(encode);
	const warnText50 = oklchLinearRgb('oklch(0.50 0.13 70)').map(encode);
	const warn = oklchLinearRgb('oklch(0.68 0.16 70)').map(encode);
	const card = oklchLinearRgb('oklch(1 0 0)').map(encode);
	const wash = warn.map((c, i) => 0.1 * c + 0.9 * card[i]);
	for (const [actual, expected] of [
		[warnText55, [161, 97, 0]],
		[warnText50, [145, 82, 0]],
		[wash, [250, 242, 229]],
	]) {
		const pixels = actual.map((c) => Math.round(c * 255));
		actual.forEach((c, i) => {
			assert.ok(Math.abs(Math.round(c * 255) - expected[i]) <= 1, `${pixels} != ${expected}`);
		});
	}
});

// Text contrast 4.5:1 (CODING_STANDARDS § Design 7). The light theme's --ok read 4.16:1 under
// its own success-foreground at L 0.55; every success green is drawn from it.
const TEXT_CONTRAST = 4.5;
// Warning washes appear in register-count, legacy-tab, Badge, ListItem, Avatar
// and log-view; destructive/10 with destructive words appears in legacy-tab and log-view.
for (const name of themeNames) {
	for (const [text, tint, alpha] of [
		['warning-text', 'warning', 0.1],
		['warning-text', 'warning', 0.15],
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
		['price-chip-foreground', 'price-chip'],
		['selected-foreground', 'selected'],
		// `text-primary` is ink on links and the Split action, not only a fill (Codex on #3124).
		['primary', 'card'],
		['primary', 'background'],
		['primary-foreground', 'primary'],
		['warning-text', 'card'],
		['warning-text', 'background'],
		['destructive', 'card'],
		['destructive', 'background'],
		['destructive-foreground', 'destructive'],
		['action-foreground', 'action'],
		['warning-foreground', 'warning'],
		['info-foreground', 'info'],
		['info', 'card'],
		['info', 'background'],
	]) {
		test(`${name}: ${text} on ${ground} reaches 4.5:1`, () => {
			const body = css.match(new RegExp(`@variant\\s+${name}\\s*\\{([^{}]*)\\}`))?.[1];
			assert.ok(body, `Missing ${name} theme`);
			if (ground === 'price-chip' && themeToken(body, ground) === 'transparent') return;
			const ratio = contrast(themeToken(body, text), themeToken(body, ground));
			assert.ok(ratio >= TEXT_CONTRAST, `${name}: ${text} on ${ground} is ${ratio.toFixed(2)}:1`);
		});
	}
}
