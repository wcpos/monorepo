import { readFileSync } from 'node:fs';

import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Skeleton, skeletonCount } from './index';

// Keep token classes visible: the Jest harness does not compile Uniwind styles.
jest.mock('react-native', () => ({
	View: ({ testID, accessible, ...props }: { testID?: string; accessible?: boolean }) =>
		React.createElement('div', { ...props, 'data-testid': testID, 'data-accessible': accessible }),
}));

it.each([
	['block', 'flex-1 w-full'],
	['line', 'h-5'],
	['row', 'h-row w-full'],
	['tile', 'h-tile w-full'],
] as const)('renders a still busy %s shape', (shape, classes) => {
	render(<Skeleton shape={shape} testID="shape" className="w-1/2" />);
	expect(screen.getByTestId('shape')).toHaveClass(
		'bg-muted',
		'rounded-lg',
		...classes.split(' ').filter((c) => c !== 'w-full'),
		'w-1/2'
	);
	expect(screen.getByTestId('shape')).toHaveAttribute('aria-busy', 'true');
	expect(screen.getByTestId('shape')).toHaveAttribute('data-accessible', 'false');
});

it('defaults to filling the caller box', () => {
	render(<Skeleton testID="shape" />);
	expect(screen.getByTestId('shape')).toHaveClass('flex-1', 'w-full');
});

it.each([
	[600, 44, 12],
	[1200, 44, 12],
	[100, 44, 3],
	[0, 44, 1],
	[100, NaN, 1],
	[100, 0, 1],
	[100, -1, 1],
	[100, Infinity, 1],
])('counts %s / %s as %s rows', (extent, rowHeight, count) => {
	expect(skeletonCount(extent, rowHeight)).toBe(count);
});

it('imports no animation and uses no animation utility', () => {
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8')).not.toMatch(/reanimated|animate-/);
});
