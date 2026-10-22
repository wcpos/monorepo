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

// One gutter on every list surface (CODING_STANDARDS § Design, Gutters): the pages and the POS
// products column alike.
it('insets the card by the page gutter on its sides and bottom, leaving the top to the row above', () => {
	render(<TableSurface testID="surface" />);
	expect(classes()).toEqual(
		expect.arrayContaining(['mx-gutter', 'mb-gutter', 'rounded-lg', 'border'])
	);
	expect(classes().some((name) => /^(m|mt|my)-/.test(name))).toBe(false);
});

// The caption row's text sits on the cells' text: the card's gutter plus the cell's 12 — and,
// as the pane's last row, it carries the gutter below it too (the bottom edge is a container
// edge like the top one; owner, 2026-10-20).
it('insets the caption row by the gutter plus the cell padding, and by the gutter below', () => {
	const inset = () => {
		const { unmount } = render(
			<CaptionRowInset>
				<span data-testid="caption" />
			</CaptionRowInset>
		);
		const node = screen.getByTestId('data-table-caption-inset');
		const cell = node.firstElementChild as HTMLElement;
		expect(cell.contains(screen.getByTestId('caption'))).toBe(true);
		const value = [node.getAttribute('data-class'), cell.getAttribute('data-class')];
		unmount();
		return value;
	};
	expect(inset()).toEqual(['px-gutter pb-gutter', 'px-3']);
	// The phone card has no side gutter, so the caption sits on the cell's 12 alone, and the
	// screen pads the home indicator itself, so there is no bottom gutter either.
	mockPhone = true;
	expect(inset()).toEqual([null, 'px-3']);
});

it('runs edge to edge on a phone', () => {
	mockPhone = true;
	render(<TableSurface testID="surface" />);
	expect(classes()).toContain('border-t');
	expect(classes().some((name) => /^(mx|mb|rounded)/.test(name))).toBe(false);
});
