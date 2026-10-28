/**
 * One state vocabulary (card 16): `ok`, `warning`, `bad`, `info`, `muted` on every surface, `bad` the
 * same red as the `destructive` ACTION (`--bad: var(--destructive)`). A tinted wash keeps its words in
 * the foreground; `text` is a word's, glyph's or amount's ink (warning's is the darker amber).
 */
export type Tone = 'ok' | 'warning' | 'bad' | 'info' | 'muted';

export const TONE = {
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
} as const satisfies Record<Tone, Record<string, string>>;
