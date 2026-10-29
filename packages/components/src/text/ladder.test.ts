import * as React from 'react';

import { render } from '@testing-library/react';

import { Text, TextClassContext } from './index';
import { textVariants } from './ladder';

jest.mock('react-native', () => {
	const mockReact = jest.requireActual('react');
	return { Text: (props: object) => mockReact.createElement('span', props) };
});

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

describe('Text under an inherited text context', () => {
	const renderIn = (context: string, props: React.ComponentProps<typeof Text>) =>
		render(
			React.createElement(
				TextClassContext.Provider,
				{ value: context },
				React.createElement(Text, props, 'x')
			)
		).container.querySelector('span');

	it('lets an explicit rank win over the context (an overlay paints text-foreground)', () => {
		const text = renderIn('text-foreground', { variant: 'caption' });
		expect(text).toHaveClass('text-muted-foreground', 'uppercase');
		expect(text).not.toHaveClass('text-foreground');
	});

	it('lets the context style a Text with no rank, and the caller className win over both', () => {
		expect(renderIn('text-sm text-muted-foreground', {})).toHaveClass(
			'text-sm',
			'text-muted-foreground'
		);
		const toned = renderIn('text-foreground', { variant: 'help', className: 'text-warning-text' });
		expect(toned).toHaveClass('text-warning-text', 'text-xs');
		expect(toned).not.toHaveClass('text-muted-foreground');
	});
});
