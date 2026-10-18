/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { CaptionRowInset, TableSurface } from './surface';

let mockPhone = false;
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => mockPhone }));
jest.mock('react-native', () => ({
	View: ({
		className,
		testID,
		children,
	}: React.PropsWithChildren<{ className?: string; testID?: string }>) => (
		<div data-testid={testID} data-class={className}>
			{children}
		</div>
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

// The caption row's text sits on the cells' text: the card's gutter plus the cell's 12.
it('insets the caption row by the gutter plus the cell padding', () => {
	const inset = (gutter?: 'page' | 'dense') => {
		const { unmount } = render(
			<CaptionRowInset gutter={gutter}>
				<span data-testid="caption" />
			</CaptionRowInset>
		);
		const node = screen.getByTestId('data-table-caption-inset');
		expect(node.contains(screen.getByTestId('caption'))).toBe(true);
		const value = node.getAttribute('data-class');
		unmount();
		return value;
	};
	expect(inset('page')).toBe('px-7');
	expect(inset()).toBe('px-5');
	expect(inset('dense')).toBe('px-5');
	// The phone card has no side gutter, so the caption sits on the cell's 12 alone.
	mockPhone = true;
	expect(inset('page')).toBe('px-3');
	expect(inset('dense')).toBe('px-3');
});

it.each(['page', 'dense'] as const)('runs edge to edge on a phone (%s)', (gutter) => {
	mockPhone = true;
	render(<TableSurface testID="surface" gutter={gutter} />);
	expect(classes()).toContain('border-t');
	expect(classes().some((name) => /^(mx|mb|rounded)/.test(name))).toBe(false);
});
