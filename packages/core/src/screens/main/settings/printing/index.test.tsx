/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render } from '@testing-library/react';

import { PrintingSettings } from './index';
const mockDeletePrinterProfile = jest.fn().mockResolvedValue(true);
const profile = { id: 'counter', name: 'Counter', isBuiltIn: false, connectionType: 'network' };
const storeDB = {};
jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../../jest/property-row.test-utils')
);
jest.mock('@wcpos/query', () => ({
	deletePrinterProfile: (...args: unknown[]) => mockDeletePrinterProfile(...args),
	observeTemplatePrinterOverrides: () => ({ pipe: () => new Map() }),
}));
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
jest.mock('@wcpos/components/empty-state', () => ({ EmptyState: () => null }));
jest.mock('@wcpos/components/device-row', () => ({
	DeviceList: ({ children }: { children: React.ReactNode }) => children,
}));
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
		AlertDialogFooter: (props: import('@wcpos/components/alert-dialog').AlertDialogFooterProps) => {
			const close = React.useContext(Context);
			const Footer = jest.requireActual('../../../../../jest/footer.test-utils').AlertDialogFooter;
			const cancel = typeof props.cancel === 'object' ? props.cancel : {};
			return (
				<Footer
					{...props}
					cancel={
						props.cancel === false
							? false
							: {
									...cancel,
									onPress: (event: Parameters<NonNullable<typeof cancel.onPress>>[0]) => {
										cancel.onPress?.(event);
										close(false);
									},
								}
					}
				/>
			);
		},
		AlertDialogTitle: Part,
		AlertDialogDescription: Part,
	};
});

beforeEach(() => jest.clearAllMocks());
it('asks with the printer name, and cancel removes nothing', async () => {
	const { getByTestId, queryByRole } = render(<PrintingSettings />);
	await act(async () => fireEvent.click(getByTestId('printer-row-counter-delete')));
	expect(queryByRole('alertdialog')?.textContent).toContain('Delete Counter?');
	expect(mockDeletePrinterProfile).not.toHaveBeenCalled();
	fireEvent.click(getByTestId('printer-row-counter-delete-cancel'));
	expect(queryByRole('alertdialog')).toBeNull();
	expect(mockDeletePrinterProfile).not.toHaveBeenCalled();
});
it('removes only when confirmed and closes the confirmation', async () => {
	const { getByTestId, queryByRole } = render(<PrintingSettings />);
	fireEvent.click(getByTestId('printer-row-counter-delete'));
	await act(async () => fireEvent.click(getByTestId('printer-row-counter-delete-confirm')));
	expect(mockDeletePrinterProfile).toHaveBeenCalledWith(storeDB, 'counter');
	expect(mockDeletePrinterProfile).toHaveBeenCalledTimes(1);
	expect(queryByRole('alertdialog')).toBeNull();
});
