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

it('is a card with a hairline border and the 8 pt radius on the muted-wash surface', () => {
	render(<Tile testID="tile" onPress={() => {}} />);
	for (const token of ['bg-card', 'rounded-lg', 'border', 'border-border', 'active:bg-muted'])
		expect(classes('tile').split(' ')).toContain(token);
});

it('has a 64 pt square key and a labelled tile at least 64 tall', () => {
	render(
		<>
			<Tile testID="key" size="tile" />
			<Tile testID="labelled" />
		</>
	);
	expect(classes('key')).toContain('size-tile');
	expect(classes('labelled')).toContain('min-h-tile');
	expect(classes('labelled')).toContain('flex-col');
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
