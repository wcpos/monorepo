import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { SectionHeading } from './index';

// Keep RNW rendering; Jest does not compile Uniwind classes, so expose them on the DOM.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		Text: ({ className, ...props }: import('react-native').TextProps) =>
			React.createElement(actual.Text, { ...props, dataSet: { classes: className } }),
	};
});

const classes = (element: HTMLElement) => element.dataset.classes?.split(' ') ?? [];

describe('SectionHeading', () => {
	it('renders a level-2 heading with the title and the description', () => {
		render(<SectionHeading title="Store" description="Where the till sells from" />);

		const heading = screen.getByRole('heading', { level: 2, name: 'Store' });
		expect(classes(heading)).toEqual(
			expect.arrayContaining(['text-base', 'font-semibold', 'text-foreground'])
		);
		const description = screen.getByText('Where the till sells from');
		expect(classes(description)).toEqual(
			expect.arrayContaining(['text-xs', 'text-muted-foreground'])
		);
	});
});
