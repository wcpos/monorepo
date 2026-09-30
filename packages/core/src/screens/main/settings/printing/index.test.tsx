/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render } from '@testing-library/react';

import { PrintingSettings } from './index';
const mockRemove = jest.fn().mockResolvedValue(undefined);
const profile = { id: 'counter', name: 'Counter', isBuiltIn: false, connectionType: 'network' };
const mockFindOne = jest.fn(() => ({ exec: async () => ({ ...profile, remove: mockRemove }) }));
const storeDB = {
	collections: {
		printer_profiles: { findOne: mockFindOne },
		template_printer_overrides: { find: () => ({ $: { pipe: () => new Map() } }) },
	},
};
jest.mock('observable-hooks', () => ({ useObservableState: (value: unknown) => value }));
jest.mock('@wcpos/printer', () => ({
	PrinterService: class {
		dispose = async () => {};
	},
	resolvePrinter: jest.fn(),
}));
jest.mock('../../../../contexts/app-state', () => ({ useStoreSession: () => ({ storeDB }) }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('../../hooks/use-cloud-enqueue', () => ({ createCloudEnqueueFactory: () => undefined }));
jest.mock('../../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => ({}) }));
jest.mock('../../receipt/hooks/use-active-templates', () => ({ useActiveTemplates: () => [] }));
jest.mock('../printer/use-available-printer-profiles', () => ({
	useAvailablePrinterProfiles: () => ({ printers: [profile], isLoading: false }),
}));
jest.mock('../printer/add-printer', () => ({ PrinterDialog: () => null }));
jest.mock('./use-ensure-system-printer', () => ({ useEnsureSystemPrinter: () => {} }));
jest.mock('./printers-empty-state', () => ({ PrintersEmptyState: () => null }));
jest.mock('./template-row', () => ({ TemplateRow: () => null }));
jest.mock('./printer-row', () => ({
	PrinterRow: ({ onDelete }: { onDelete: (id: string) => void }) => (
		<button data-testid="printer-row-counter-delete" onClick={() => onDelete('counter')}>
			Delete
		</button>
	),
}));
jest.mock('@wcpos/components/button', () => ({ Button: () => null }));
jest.mock('@wcpos/components/docs-link', () => ({ DocsLink: () => null }));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));
jest.mock('@wcpos/components/alert-dialog', () => {
	const Context = React.createContext((_open: boolean) => {});
	function Part({ children }: React.PropsWithChildren) {
		return <div>{children}</div>;
	}
	return {
		AlertDialog: ({
			open,
			onOpenChange,
			children,
		}: React.PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) => (
			<Context.Provider value={onOpenChange}>
				{open ? <div role="alertdialog">{children}</div> : null}
			</Context.Provider>
		),
		AlertDialogContent: Part,
		AlertDialogHeader: Part,
		AlertDialogFooter: Part,
		AlertDialogTitle: Part,
		AlertDialogDescription: Part,
		AlertDialogAction: ({
			children,
			testID,
			onPress,
		}: React.PropsWithChildren<{ testID: string; onPress: () => void }>) => (
			<button data-testid={testID} onClick={onPress}>
				{children}
			</button>
		),
		AlertDialogCancel: ({ children, testID }: React.PropsWithChildren<{ testID: string }>) => {
			const close = React.useContext(Context);
			return (
				<button data-testid={testID} onClick={() => close(false)}>
					{children}
				</button>
			);
		},
	};
});

beforeEach(() => jest.clearAllMocks());
it('asks with the printer name, and cancel removes nothing', async () => {
	const { getByTestId, queryByRole } = render(<PrintingSettings />);
	await act(async () => fireEvent.click(getByTestId('printer-row-counter-delete')));
	expect(queryByRole('alertdialog')?.textContent).toContain('Delete Counter?');
	expect(mockRemove).not.toHaveBeenCalled();
	fireEvent.click(getByTestId('printer-row-counter-delete-cancel'));
	expect(queryByRole('alertdialog')).toBeNull();
	expect(mockFindOne).not.toHaveBeenCalled();
	expect(mockRemove).not.toHaveBeenCalled();
});
it('removes only when confirmed and closes the confirmation', async () => {
	const { getByTestId, queryByRole } = render(<PrintingSettings />);
	fireEvent.click(getByTestId('printer-row-counter-delete'));
	await act(async () => fireEvent.click(getByTestId('printer-row-counter-delete-confirm')));
	expect(mockFindOne).toHaveBeenCalledWith('counter');
	expect(mockRemove).toHaveBeenCalledTimes(1);
	expect(queryByRole('alertdialog')).toBeNull();
});
