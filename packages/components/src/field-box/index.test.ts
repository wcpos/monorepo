import { fieldBox, type FieldBoxState } from './index';

const BOX = ['h-ctl', 'rounded-field', 'text-foreground', 'text-base'];
// The resting outline is the theme's (0 px in Bold money); a state that must be seen keeps its own
// 1 px border, and tailwind-merge lets the later width win (Codex on #3139).
const THEME_WIDTH = 'border-[length:var(--shape-ctl-border)]';
const SEEN = 'border';
const PLACEHOLDER = 'placeholder:text-muted-foreground';
const RING = ['border-ring', 'web:ring-1', 'web:ring-ring'];
const DIM = ['opacity-45', 'web:cursor-not-allowed'];
const MARK = ['border-attention', 'bg-attention/15'];

/** Every state draws the one box; each adds only its own mark and none of the others'. */
const MATRIX: [FieldBoxState, { has: string[]; not: string[] }][] = [
	[
		'rest',
		{
			has: ['border-chip-border', THEME_WIDTH],
			not: [...RING, ...DIM, ...MARK, 'border-bad', SEEN],
		},
	],
	[
		'open',
		{
			has: [...RING, SEEN],
			not: ['border-chip-border', THEME_WIDTH, ...DIM, ...MARK, 'border-bad'],
		},
	],
	[
		'disabled',
		{
			has: ['border-chip-border', THEME_WIDTH, ...DIM],
			not: [...RING, ...MARK, 'border-bad', SEEN],
		},
	],
	[
		'invalid',
		{
			has: ['border-bad', SEEN],
			not: ['border-chip-border', THEME_WIDTH, ...RING, ...DIM, ...MARK],
		},
	],
	[
		'attention',
		{ has: [...MARK, SEEN], not: ['border-chip-border', THEME_WIDTH, 'bg-card', ...RING, ...DIM] },
	],
];

describe('fieldBox', () => {
	it.each(MATRIX)('%s', (state, { has, not }) => {
		const classes = fieldBox({ state }).split(/\s+/);
		expect(classes).toEqual(expect.arrayContaining([...BOX, PLACEHOLDER, ...has]));
		if (state !== 'attention') expect(classes).toContain('bg-card');
		for (const absent of not) expect(classes).not.toContain(absent);
	});

	it('grows from one control tall when multiline', () => {
		const classes = fieldBox({ multiline: true }).split(/\s+/);
		expect(classes).toContain('min-h-ctl');
		expect(classes).not.toContain('h-ctl');
	});
});
