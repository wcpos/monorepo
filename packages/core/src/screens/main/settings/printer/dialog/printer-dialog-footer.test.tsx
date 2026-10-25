/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { PrinterDialogFooter } from './printer-dialog-footer';
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
	}: React.PropsWithChildren<{ testID: string; onPress: () => void }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
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
it('offers Open drawer, Test Print and Close without Save actions', () => {
	const props = {
		showOpenDrawer: true,
		testLoading: false,
		drawerLoading: false,
		onOpenDrawer: jest.fn(),
		onTestPrint: jest.fn(),
		onClose: jest.fn(),
	};
	const { rerender } = render(<PrinterDialogFooter {...props} />);
	expect(screen.getAllByRole('button').map((button) => button.dataset.testid)).toEqual([
		'add-printer-open-drawer-button',
		'add-printer-test-button',
		'printer-dialog-close',
	]);
	expect(screen.getByTestId('printer-dialog-close').textContent).toBe('Close');
	expect(screen.queryByTestId('add-printer-save-button')).toBeNull();
	expect(screen.queryByTestId('add-printer-save-anyway-button')).toBeNull();
	fireEvent.click(screen.getByTestId('add-printer-open-drawer-button'));
	fireEvent.click(screen.getByTestId('add-printer-test-button'));
	fireEvent.click(screen.getByTestId('printer-dialog-close'));
	expect(props.onOpenDrawer).toHaveBeenCalledTimes(1);
	expect(props.onTestPrint).toHaveBeenCalledTimes(1);
	expect(props.onClose).toHaveBeenCalledTimes(1);
	rerender(<PrinterDialogFooter {...props} showOpenDrawer={false} />);
	expect(screen.queryByTestId('add-printer-open-drawer-button')).toBeNull();
});
