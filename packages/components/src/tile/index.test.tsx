import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Tile } from './index';

let mockPointer: 'fine' | 'coarse' = 'fine';
// Keep RNW press behaviour; expose classes because Jest does not compile Uniwind.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		Pressable: ({ className, ...props }: import('react-native').PressableProps) =>
			React.createElement(actual.Pressable, { ...props, dataSet: { classes: className } }),
	};
});
jest.mock('../lib/device', () => ({ usePointer: () => mockPointer }));

const classes = (testID: string) => screen.getByTestId(testID).dataset.classes ?? '';

beforeEach(() => {
	mockPointer = 'fine';
});

it('is a card with a hairline border and the 8 pt radius on the accent-wash surface', () => {
	render(<Tile testID="tile" onPress={() => {}} />);
	for (const token of ['bg-card', 'rounded-lg', 'border', 'border-border', 'active:bg-accent'])
		expect(classes('tile').split(' ')).toContain(token);
});

it('is at least 64 tall and grows to fill its grid cell', () => {
	render(<Tile testID="tile" />);
	for (const token of ['min-h-tile', 'grow', 'flex-col']) expect(classes('tile')).toContain(token);
});

it('draws its title, sub line and count pill in its own slots', () => {
	render(<Tile testID="den" title="Cash &amp; change" sub="Each £5.00" badge={0} />);
	expect(screen.getByText('Cash & change')).toBeInTheDocument();
	expect(screen.getByText('Each £5.00')).toBeInTheDocument();
	expect(screen.getByTestId('den-badge')).toHaveTextContent('0');
});

it.each([
	['a string', 'Each £5.00'],
	['a number', 12],
])('draws %s sub line as text, never a bare text node under the surface', (_, sub) => {
	render(<Tile testID="tile" title={3} sub={sub} />);
	// A bare text node would make the surface itself the element holding the text.
	for (const text of ['3', String(sub)]) {
		expect(screen.getByText(text)).not.toBe(screen.getByTestId('tile'));
		expect(screen.getByText(text).parentElement).toBe(screen.getByTestId('tile'));
	}
});

it('marks the picked tile with the primary border on bg-muted', () => {
	render(<Tile testID="tile" selected onPress={() => {}} />);
	expect(classes('tile')).toContain('border-primary');
	expect(classes('tile')).toContain('bg-muted');
	expect(classes('tile')).not.toContain('border-border');
	expect(screen.getByTestId('tile')).toHaveAttribute('aria-selected', 'true');
});

it('has a dashed add-another tile with no surface', () => {
	render(<Tile testID="tile" variant="dashed" />);
	expect(classes('tile')).toContain('border-dashed');
	expect(classes('tile')).toContain('bg-transparent');
	expect(classes('tile')).not.toContain('bg-card');
});
