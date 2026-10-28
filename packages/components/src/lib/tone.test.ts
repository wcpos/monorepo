import { readFileSync } from 'node:fs';
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
