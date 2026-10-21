import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PRE_THEME_COLOURS, PRE_THEME_RADIUS } from './pre-theme-colours';

const css = readFileSync(join(__dirname, '..', 'global.css'), 'utf8');
/** The `@variant light { … }` block: the first one, the default theme's. */
const light = css.slice(css.indexOf('@variant light {'), css.indexOf('@variant dark {'));

const TOKEN: Record<keyof typeof PRE_THEME_COLOURS, string> = {
	background: '--background',
	foreground: '--foreground',
	card: '--card',
	border: '--border',
	primary: '--primary',
	primaryForeground: '--primary-foreground',
	muted: '--muted',
	mutedForeground: '--muted-foreground',
	warnBg: '--warn-bg',
	warnText: '--warn-text',
	badBg: '--bad-bg',
	bad: '--bad',
	badForeground: '--primary-foreground', // no --bad-foreground in the sheet; see pre-theme-colours.ts
};

/** OKLCH → sRGB hex (Björn Ottosson's OKLab matrices), clipped to the sRGB gamut. */
function oklchToHex(l: number, c: number, h: number): string {
	const rad = (h * Math.PI) / 180;
	const a = c * Math.cos(rad);
	const b = c * Math.sin(rad);
	const lms = [
		(l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
		(l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
		(l - 0.0894841775 * a - 1.291485548 * b) ** 3,
	];
	const linear = [
		4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
		-1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
		-0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
	];
	return `#${linear
		.map((x) => {
			const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
			return Math.round(Math.min(1, Math.max(0, v)) * 255)
				.toString(16)
				.padStart(2, '0');
		})
		.join('')}`;
}

function lightToken(name: string): string {
	const match = new RegExp(`\\s${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`).exec(
		light
	);
	if (!match) throw new Error(`${name} is not a literal oklch() in the light theme`);
	return oklchToHex(Number(match[1]), Number(match[2]), Number(match[3]));
}

it.each(Object.entries(TOKEN))('%s is the light theme’s %s', (key, token) => {
	expect(PRE_THEME_COLOURS[key as keyof typeof PRE_THEME_COLOURS]).toBe(lightToken(token));
});

it('keeps the token sheet’s one radius', () => {
	expect(css).toContain(`--radius: ${PRE_THEME_RADIUS}px;`);
});
