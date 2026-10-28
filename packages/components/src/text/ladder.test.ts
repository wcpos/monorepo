import { textVariants } from './ladder';

const classes = (props: Parameters<typeof textVariants>[0]) => textVariants(props).split(/\s+/);

// rank → classes its rank adds on top of the base, and classes it must not carry.
const ladder: [NonNullable<Parameters<typeof textVariants>[0]>['variant'], string[], string[]][] = [
	['area', ['text-xl', 'font-semibold'], ['text-muted-foreground', 'uppercase']],
	['dialog', ['text-lg', 'font-semibold'], ['text-muted-foreground', 'uppercase']],
	['section', ['text-base', 'font-semibold'], ['text-muted-foreground', 'font-medium']],
	['subheading', ['text-base', 'font-medium'], ['text-muted-foreground', 'font-semibold']],
	['body', ['text-base'], ['text-muted-foreground', 'font-semibold', 'font-medium']],
	['key', ['text-sm', 'text-muted-foreground'], ['font-semibold', 'uppercase']],
	['help', ['text-xs', 'text-muted-foreground'], ['font-semibold', 'font-medium', 'uppercase']],
	[
		'caption',
		['text-xs', 'text-muted-foreground', 'font-medium', 'tracking-wide', 'uppercase'],
		['font-semibold'],
	],
];

describe('textVariants', () => {
	it.each(ladder)('%s carries its rank and nothing from another', (variant, present, absent) => {
		const list = classes({ variant });
		expect(list).toEqual(expect.arrayContaining(present));
		for (const name of absent) expect(list).not.toContain(name);
	});

	it('defaults to body, without tabular numerals', () => {
		expect(textVariants()).toBe(textVariants({ variant: 'body', tabular: false }));
		expect(classes({})).not.toContain('tabular-nums');
	});

	it('adds tabular numerals to any rank only when asked', () => {
		expect(classes({ variant: 'help', tabular: true })).toEqual(
			expect.arrayContaining(['text-xs', 'tabular-nums'])
		);
		expect(classes({ variant: 'help', tabular: false })).not.toContain('tabular-nums');
	});
});
