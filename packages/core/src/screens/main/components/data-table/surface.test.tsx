/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { TableSurface } from './surface';

let mockPhone = false;
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => mockPhone }));
jest.mock('react-native', () => ({
	View: ({ className, testID }: { className?: string; testID?: string }) => (
		<div data-testid={testID} data-class={className} />
	),
}));

const classes = () => (screen.getByTestId('surface').getAttribute('data-class') ?? '').split(' ');

beforeEach(() => {
	mockPhone = false;
});

// The container's density decides the inset (CODING_STANDARDS § Design, Gutters).
it('insets a dense pane by 8 by default, so the POS mounts stay where they were', () => {
	render(<TableSurface testID="surface" />);
	expect(classes()).toEqual(expect.arrayContaining(['mx-2', 'mb-2', 'rounded-lg', 'border']));
	expect(classes()).not.toContain('mx-4');
});

it('insets a page by 16 on its sides and bottom, leaving the top to the row above it', () => {
	render(<TableSurface testID="surface" gutter="page" />);
	expect(classes()).toEqual(expect.arrayContaining(['mx-4', 'mb-4', 'rounded-lg', 'border']));
	expect(classes()).not.toContain('mx-2');
	expect(classes().some((name) => /^(m|mt|my)-/.test(name))).toBe(false);
});

it.each(['page', 'dense'] as const)('runs edge to edge on a phone (%s)', (gutter) => {
	mockPhone = true;
	render(<TableSurface testID="surface" gutter={gutter} />);
	expect(classes()).toContain('border-t');
	expect(classes().some((name) => /^(mx|mb|rounded)/.test(name))).toBe(false);
});
