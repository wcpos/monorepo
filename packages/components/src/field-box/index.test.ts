import { fieldBox, type FieldBoxState } from './index';

const BOX = ['h-ctl', 'border', 'rounded-lg', 'text-foreground', 'text-base'];
const PLACEHOLDER = 'placeholder:text-muted-foreground';
const RING = ['border-ring', 'web:ring-1', 'web:ring-ring'];
const DIM = ['opacity-45', 'web:cursor-not-allowed'];
const MARK = ['border-attention', 'bg-attention/15'];

/** Every state draws the one box; each adds only its own mark and none of the others'. */
const MATRIX: [FieldBoxState, { has: string[]; not: string[] }][] = [
	['rest', { has: ['border-border'], not: [...RING, ...DIM, ...MARK, 'border-bad'] }],
	['open', { has: RING, not: ['border-border', ...DIM, ...MARK, 'border-bad'] }],
	['disabled', { has: ['border-border', ...DIM], not: [...RING, ...MARK, 'border-bad'] }],
	['invalid', { has: ['border-bad'], not: ['border-border', ...RING, ...DIM, ...MARK] }],
	['attention', { has: MARK, not: ['border-border', 'bg-card', ...RING, ...DIM] }],
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
