/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { PrinterDialogFooter } from './printer-dialog-footer';
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, testID }: React.PropsWithChildren<{ testID: string }>) => (
		<button data-testid={testID}>{children}</button>
	),
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () =>
		jest
			.requireActual<typeof import('../../../../../../jest/translate')>(
				'../../../../../../jest/translate'
			)
			.createTestT(),
}));
it('names creation actions but preserves edit labels', () => {
	const props = {
		showSaveAnyway: true,
		showOpenDrawer: false,
		testLoading: false,
		drawerLoading: false,
		saveLoading: false,
		onOpenDrawer: jest.fn(),
		onTestPrint: jest.fn(),
		onSave: jest.fn(),
		onSaveAnyway: jest.fn(),
	};
	const { rerender } = render(<PrinterDialogFooter {...props} isEditing={false} />);
	expect(screen.getByTestId('add-printer-save-button').textContent).toBe('Add Printer');
	expect(screen.getByTestId('add-printer-save-anyway-button').textContent).toBe(
		'Add without testing'
	);
	rerender(<PrinterDialogFooter {...props} isEditing />);
	expect(screen.getByTestId('add-printer-save-button').textContent).toBe('Save');
	expect(screen.getByTestId('add-printer-save-anyway-button').textContent).toBe(
		'Save without testing'
	);
});
