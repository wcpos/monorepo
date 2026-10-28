import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TONE, type Tone } from './tone';

// tone × face → classes: the whole state vocabulary, one row per tone.
const MAP: Record<Tone, Record<keyof (typeof TONE)[Tone], string>> = {
	ok: {
		solid: 'bg-ok',
		onSolid: 'text-success-foreground',
		tinted: 'bg-ok/15',
		text: 'text-ok',
		dot: 'bg-ok',
		disc: 'bg-ok-bg',
		band: 'border-ok/45 bg-ok-bg',
		glyph: 'check',
	},
	warning: {
		solid: 'bg-warning',
		onSolid: 'text-warning-foreground',
		tinted: 'bg-warning/15',
		text: 'text-warning-text',
		dot: 'bg-warning',
		disc: 'bg-warning-bg',
		band: 'border-warning/45 bg-warning-bg',
		glyph: 'warning',
	},
	bad: {
		solid: 'bg-bad',
		onSolid: 'text-destructive-foreground',
		tinted: 'bg-bad/15',
		text: 'text-bad',
		dot: 'bg-bad',
		disc: 'bg-bad-bg',
		band: 'border-bad/45 bg-bad-bg',
		glyph: 'alert',
	},
	info: {
		solid: 'bg-info',
		onSolid: 'text-info-foreground',
		tinted: 'bg-info/15',
		text: 'text-info',
		dot: 'bg-info',
		disc: 'bg-info/15',
		band: 'border-border bg-card',
		glyph: 'info',
	},
	muted: {
		solid: 'bg-muted',
		onSolid: 'text-muted-foreground',
		tinted: 'bg-muted',
		text: 'text-muted-foreground',
		dot: 'bg-muted-foreground',
		disc: 'bg-muted',
		band: 'border-border bg-muted',
		glyph: 'info',
	},
};

// `destructive` is an ACTION's red: a Button/IconButton/MenuRow variant and the wash it presses with, a
// delete glyph inside a destructive menu item, the cart line's swipe-to-remove strip, a remove row.
// A STATE (an error line, a refused amount, a failed step, a short count) reads the tone map's `bad`.
const ACTION_FILES = [
	'components/src/button/index.tsx',
	'components/src/icon-button/index.tsx',
	'components/src/menu-row/index.tsx',
	'components/src/pressable-surface/index.tsx',
	'core/src/screens/auth/components/site.tsx',
	'core/src/screens/auth/components/sites.tsx',
	'core/src/screens/main/health/conflicted-mutations.tsx',
	'core/src/screens/main/health/database.tsx',
	'core/src/screens/main/health/rejected-mutations.tsx',
	'core/src/screens/main/pos/cart/cells/line-strip.tsx',
	'core/src/screens/main/pos/products/filter-bar/quick-filter-editor.tsx',
	'core/src/screens/main/settings/barcode-scanning/input-sources.tsx',
	'core/src/screens/main/settings/card-readers/reader-row.tsx',
	'core/src/screens/main/settings/customer-display/paired-displays.tsx',
	'core/src/screens/main/settings/printing/printer-row.tsx',
];
const ACTION_RED = /\b(?:text|bg|border|fill|ring)-destructive(?!-foreground)/;
const packages = join(__dirname, '../../..');

function filesUsingActionRed(root: string): string[] {
	return (readdirSync(join(packages, root), { recursive: true }) as string[])
		.filter((file) => /\.tsx?$/.test(file) && !/\.test\.|__tests__/.test(file))
		.map((file) => `${root}/${file}`)
		.filter((file) => ACTION_RED.test(readFileSync(join(packages, file), 'utf8')));
}

const css = readFileSync(join(__dirname, '../../../../apps/main/global.css'), 'utf8').replace(
	/\/\*[\s\S]*?\*\//g,
	''
);
const themes = [...css.matchAll(/@variant\s+(\w+)\s*\{([^{}]*)\}/g)].map(([, name, body]) => ({
	name,
	body,
}));

/** A token's value in one theme, following `var(--x)` until it reaches a literal. */
function resolve(body: string, token: string): string {
	const value = new RegExp(`\\s${token}:\\s*([^;]+);`).exec(body)?.[1].trim();
	if (value === undefined) throw new Error(`${token} is not declared`);
	const alias = /^var\((--[\w-]+)\)$/.exec(value);
	return alias ? resolve(body, alias[1]) : value;
}

describe('the tone map', () => {
	it('names every state once, with every face', () => {
		expect(TONE).toEqual(MAP);
	});

	it.each(themes.map((theme) => [theme.name, theme.body]))(
		// A destructive confirm fills `bg-destructive` (alert-dialog.test.tsx); `bad` is the same red.
		'%s: a bad state and the Button’s destructive action are one red',
		(_name, body) => {
			expect(resolve(body, '--bad')).toBe(resolve(body, '--destructive'));
			expect(resolve(body, '--bad')).toMatch(/^oklch\(/);
		}
	);

	it('paints no state in the action red: destructive classes stay in action files', () => {
		const files = ['components/src', 'core/src'].flatMap(filesUsingActionRed);
		expect(files.filter((file) => !ACTION_FILES.includes(file))).toEqual([]);
	});

	it('reads five themes and no retired warn token in any of them', () => {
		expect(themes.map((theme) => theme.name)).toEqual([
			'light',
			'dark',
			'ocean',
			'sunset',
			'monochrome',
		]);
		expect(css).not.toMatch(/--(?:color-)?warn(?:-text|-bg)?\s*:/);
	});
});
