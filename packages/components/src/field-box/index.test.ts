import { fieldBox, type FieldBoxState } from './index';

const BOX = ['h-ctl', 'bg-card', 'border', 'rounded-lg', 'text-foreground', 'text-base'];
const PLACEHOLDER = 'placeholder:text-muted-foreground';
const RING = ['border-ring', 'web:ring-1', 'web:ring-ring'];
const DIM = ['opacity-45', 'web:cursor-not-allowed'];

/** Every state draws the one box; each adds only its own mark and none of the others'. */
const MATRIX: [FieldBoxState, { has: string[]; not: string[] }][] = [
	['rest', { has: ['border-border'], not: [...RING, ...DIM, 'border-destructive'] }],
	['open', { has: RING, not: ['border-border', ...DIM, 'border-destructive'] }],
	['disabled', { has: ['border-border', ...DIM], not: [...RING, 'border-destructive'] }],
	['invalid', { has: ['border-destructive'], not: ['border-border', ...RING, ...DIM] }],
];

describe('fieldBox', () => {
	it.each(MATRIX)('%s', (state, { has, not }) => {
		const classes = fieldBox({ state }).split(/\s+/);
		expect(classes).toEqual(expect.arrayContaining([...BOX, PLACEHOLDER, ...has]));
		for (const absent of not) expect(classes).not.toContain(absent);
	});

	it('grows from one control tall when multiline', () => {
		const classes = fieldBox({ multiline: true }).split(/\s+/);
		expect(classes).toContain('min-h-ctl');
		expect(classes).not.toContain('h-ctl');
	});
});
