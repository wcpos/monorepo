/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { ProductsDisplayOptions } from './display-options';

const mockPatch = jest.fn();
const mockSettingsIds: string[] = [];
let mockDialogProps: Record<string, unknown> = {};
jest.mock('../contexts/ui-settings', () => ({
	useUISettings: (id: string) => {
		mockSettingsIds.push(id);
		return { uiSettings: { variationsStyle: 'inline' }, patchUI: mockPatch };
	},
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: object, select: (value: object) => unknown) => select(doc),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../components/ui-settings', () => ({
	UISettingsDialog: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
		mockDialogProps = props;
		return children;
	},
	UISettingsColumnsOnlyForm: ({ id, before }: { id: string; before?: React.ReactNode }) => (
		<div data-testid={`columns-${id}`}>
			{before}
			<div data-testid="columns-list" />
		</div>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/segmented-control', () => ({
	SegmentedControl: ({
		value,
		onValueChange,
		segments,
		'aria-label': label,
	}: {
		'aria-label'?: string;
		value: string;
		onValueChange: (value: string) => void;
		segments: { value: string; label: string; testID: string }[];
	}) => (
		<div role="radiogroup" aria-label={label}>
			{segments.map((segment) => (
				<button
					key={segment.value}
					data-testid={segment.testID}
					aria-pressed={segment.value === value}
					onClick={() => onValueChange(segment.value)}
				>
					{segment.label}
				</button>
			))}
		</div>
	),
}));

it('shows the POS panel’s variations style above the columns and writes it to the pos-products doc', () => {
	render(<ProductsDisplayOptions title="Product settings" />);
	// The page's own trigger and panel ids are kept.
	expect(mockDialogProps).toMatchObject({
		triggerTestID: 'products-bar-display',
		contentTestID: 'products-display-options',
		closeTestID: 'products-display-close',
	});
	const inline = screen.getByTestId('products-variations-style-inline');
	const drill = screen.getByTestId('products-variations-style-drill');
	// The same words as the POS panel's control, above the columns.
	expect(drill.textContent).toBe('pos_products.variations_open_in_place');
	// Always a table here, so never "popover".
	expect(inline.textContent).toBe('pos_products.variations_expanded_rows');
	expect(screen.getByText('pos_products.variations_style')).toBeTruthy();
	expect(
		drill.compareDocumentPosition(screen.getByTestId('columns-list')) &
			Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
	expect(inline.getAttribute('aria-pressed')).toBe('true');
	// The group is named: a radiogroup with no name reads as a bare list of choices.
	expect(screen.getByRole('radiogroup').getAttribute('aria-label')).toBe(
		'pos_products.variations_style'
	);
	fireEvent.click(drill);
	expect(mockSettingsIds).toContain('pos-products');
	expect(mockPatch).toHaveBeenCalledWith({ variationsStyle: 'drill' });
	expect(screen.getByTestId('columns-products')).toBeTruthy();
});
