/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, within } from '@testing-library/react';

import { PrintingSettings } from './index';
const mockDeletePrinterProfile = jest.fn().mockResolvedValue(true);
const profile = { id: 'counter', name: 'Counter', isBuiltIn: false, connectionType: 'network' };
const storeDB = {};
const mockSetTemplatePrinterOverride = jest.fn().mockResolvedValue(undefined);
let mockTemplates = {
	receipt: [{ id: 'receipt-1', title: 'Sale receipt', type: 'receipt', output_type: 'html' }],
	report: [{ id: 'report-1', title: 'Sales report', type: 'report', output_type: 'html' }],
	closure: [{ id: 'closure-1', title: 'Z report', type: 'closure', output_type: 'escpos' }],
};
jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../../jest/property-row.test-utils')
);
jest.mock('@wcpos/query', () => ({
	deletePrinterProfile: (...args: unknown[]) => mockDeletePrinterProfile(...args),
	setTemplatePrinterOverride: (...args: unknown[]) => mockSetTemplatePrinterOverride(...args),
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
jest.mock('../../receipt/hooks/use-active-templates', () => ({
	useActiveTemplates: (type: keyof typeof mockTemplates = 'receipt') => mockTemplates[type],
}));
jest.mock('../printer/use-available-printer-profiles', () => ({
	useAvailablePrinterProfiles: () => ({ printers: [profile], isLoading: false }),
}));
jest.mock('../printer/add-printer', () => ({ PrinterDialog: () => null }));
jest.mock('./use-ensure-system-printer', () => ({ useEnsureSystemPrinter: () => {} }));
// Keep the real section, empty state and template row; replace animated library parts.
jest.mock('@wcpos/components/badge', () => ({
	Badge: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/progress', () => ({ Progress: () => null }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
// The overlay needs native layout; a DOM select exercises the row's value/change contract.
jest.mock('@wcpos/components/select', () => {
	const Part = ({ children }: React.PropsWithChildren) => children;
	return {
		Select: ({
			value,
			onValueChange,
			children,
		}: React.PropsWithChildren<{
			value: { value: string; label: string };
			onValueChange: (option: { value: string; label: string }) => void;
		}>) => (
			<select
				value={value.value}
				onChange={(event) =>
					onValueChange({
						value: event.target.value,
						label: event.target.selectedOptions[0].text,
					})
				}
			>
				{children}
			</select>
		),
		SelectTrigger: () => null,
		SelectValue: () => null,
		SelectContent: Part,
		SelectGroup: Part,
		SelectItem: ({ value, label }: { value: string; label: string }) => (
			<option value={value}>{label}</option>
		),
	};
});
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

// Omitting a template type, mixing its list, or dropping its routing handler must fail here.
it('groups all three template types with routing selects and per-type empty states', async () => {
	const { getByText, getByTestId, rerender, container } = render(<PrintingSettings />);
	const titles = ['Receipt Templates', 'Report templates', 'Closure templates'];
	const headings = titles.map((title) => getByText(title));
	expect(
		headings[0].compareDocumentPosition(headings[1]) & Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
	expect(
		headings[1].compareDocumentPosition(headings[2]) & Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
	for (const [index, id, name] of [
		[0, 'receipt-1', 'Sale receipt'],
		[1, 'report-1', 'Sales report'],
		[2, 'closure-1', 'Z report'],
	] as const) {
		const row = getByTestId(`template-row-${id}`);
		// SectionHeading is the first child of SettingsSection, beside its row list.
		const section = headings[index].parentElement!.parentElement!;
		expect(section.contains(row)).toBe(true);
		expect(row.textContent).toContain(name);
		const select = within(getByTestId(`template-row-${id}-printer-select`)).getByRole('combobox');
		await act(async () => fireEvent.change(select, { target: { value: 'counter' } }));
		expect(mockSetTemplatePrinterOverride).toHaveBeenLastCalledWith(storeDB, id, 'counter');
	}
	expect(container.querySelectorAll('select')).toHaveLength(3);
	const populated = mockTemplates;
	for (const [index, type] of ['receipt', 'report', 'closure'].entries()) {
		mockTemplates = { ...populated, [type]: [] };
		rerender(<PrintingSettings />);
		const section = getByText(titles[index]).parentElement!.parentElement!;
		expect(within(section).getByText('No active templates found.')).toBeTruthy();
		expect(within(section).queryByRole('combobox')).toBeNull();
		expect(container.querySelectorAll('select')).toHaveLength(2);
	}
	mockTemplates = populated;
});
