import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { MoneyList } from './index';
import { Text } from '../text';

// Expose classes because Jest does not compile Uniwind.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	const host = (tag: string, props: Record<string, any>) =>
		React.createElement(
			tag,
			{ 'data-testid': props.testID, 'data-classes': props.className },
			props.children
		);
	return {
		...actual,
		View: (props: Record<string, any>) => host('div', props),
		Text: (props: Record<string, any>) => host('span', props),
	};
});

const classes = (id: string) => (screen.getByTestId(id) as HTMLElement).dataset.classes ?? '';
const labelOf = (row: string) =>
	(screen.getByTestId(row).querySelector('span') as HTMLElement).dataset.classes ?? '';

// kind, props → the label's classes, the amount's classes, and classes neither may carry.
const matrix: [string, object, string[], string[], string[]][] = [
	[
		'row',
		{},
		['text-base', 'text-muted-foreground'],
		['text-base', 'text-foreground'],
		['font-semibold', 'border-t'],
	],
	[
		'row',
		{ tone: 'destructive' },
		['text-destructive'],
		['text-destructive'],
		['text-muted-foreground'],
	],
	['row', { tone: 'success' }, ['text-success'], ['text-success'], ['text-muted-foreground']],
	[
		'row',
		{ indent: true },
		['text-xs', 'text-muted-foreground'],
		['text-xs', 'text-muted-foreground'],
		['text-base'],
	],
	[
		'total',
		{},
		['text-base', 'font-semibold'],
		['text-base', 'font-semibold'],
		['text-muted-foreground'],
	],
	[
		'total',
		{ tone: 'success' },
		['font-semibold', 'text-success'],
		['font-semibold', 'text-success'],
		['text-muted-foreground'],
	],
];

describe('MoneyList', () => {
	it.each(matrix)('a %s %j', (kind, props, label, amount, absent) => {
		const Line = kind === 'total' ? MoneyList.Total : MoneyList.Row;
		render(
			<MoneyList>
				<Line testID="line" amountTestID="amount" label="Subtotal" amount="$10.00" {...props} />
			</MoneyList>
		);
		expect(screen.getByTestId('amount').textContent).toBe('$10.00');
		const words = { label: labelOf('line').split(/\s+/), amount: classes('amount').split(/\s+/) };
		expect(words.label).toEqual(expect.arrayContaining(label));
		expect(words.amount).toEqual(expect.arrayContaining([...amount, 'tabular-nums', 'text-right']));
		for (const name of absent) {
			expect(words.label).not.toContain(name);
			expect(words.amount).not.toContain(name);
		}
	});

	it('closes with the one total rule: a hairline above, never dashed, never a size step', () => {
		render(<MoneyList.Total testID="total" label="Total" amount="$10.00" />);
		const rule = classes('total').split(/\s+/);
		expect(rule).toEqual(expect.arrayContaining(['border-t', 'border-border', 'pt-2']));
		expect(rule).not.toContain('border-dashed');
		expect(rule.some((name) => /^text-(lg|xl|2xl|amt)$/.test(name))).toBe(false);
	});

	it('insets a breakdown row and gives a node label the row tone', () => {
		render(
			<MoneyList.Row
				testID="tax"
				indent
				tone="destructive"
				label={<Text testID="word">GST</Text>}
				amount="$1.00"
			/>
		);
		expect(classes('tax')).toContain('pl-3');
		expect(classes('word')).toContain('text-destructive');
	});

	it('draws a row with no amount as its label alone', () => {
		render(<MoneyList.Total testID="paid" label="Paid in full" tone="success" />);
		expect(screen.getByTestId('paid').textContent).toBe('Paid in full');
	});
});
