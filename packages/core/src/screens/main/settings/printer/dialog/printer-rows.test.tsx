/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { PrinterDialogLayout } from './printer-dialog-layout';
import { DEFAULT_FORM_VALUES, type PrinterFormValues, type VendorOption } from '../schema';

type Field = { value?: unknown; onChange: (value: unknown) => void; testID?: string };

jest.mock('react-native', () => ({
	View: ({
		children,
		className,
		testID,
	}: React.PropsWithChildren<{ className?: string; testID?: string }>) => (
		<div className={className} data-testid={testID}>
			{children}
		</div>
	),
}));
jest.mock('@wcpos/components/form', () => {
	const { FormProvider, Controller } = jest.requireActual('react-hook-form');
	return {
		Form: FormProvider,
		FormField: Controller,
		FormItem: ({ children }: React.PropsWithChildren) => <>{children}</>,
		FormInput: ({ testID }: Field) => <input data-testid={testID} />,
		FormSwitch: ({ value, testID }: Field) => (
			<input type="checkbox" data-testid={testID} checked={!!value} readOnly />
		),
		// The selects are stubs: these tests pin which rows exist and where, not the pickers.
		FormSelect: () => <span data-testid="select" />,
		SavedMark: () => null,
		useSavedName: () => '',
	};
});
jest.mock('@wcpos/components/dialog', () => {
	function Wrap({ children }: React.PropsWithChildren) {
		return <div>{children}</div>;
	}
	return {
		Dialog: Wrap,
		DialogContent: Wrap,
		DialogHeader: Wrap,
		DialogTitle: Wrap,
		DialogBody: Wrap,
		DialogFooter: () => null,
	};
});
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<span data-testid={testID}>{children}</span>
	),
	TextClassContext: jest.requireActual('react').createContext(''),
}));
jest.mock('@wcpos/components/button', () => ({ Button: () => null, ButtonText: () => null }));
jest.mock('../components/code-page-select', () => ({ CodePageSelect: () => null }));
jest.mock('../components/drawer-connector-select', () => ({ DrawerConnectorSelect: () => null }));
jest.mock('../components/language-select', () => ({ LanguageSelect: () => null }));
jest.mock('../components/paper-width-select', () => ({ PaperWidthSelect: () => null }));
jest.mock('../components/vendor-select', () => ({ VendorSelect: () => null }));
jest.mock('../../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));

const VENDORS: VendorOption[] = [{ value: 'epson', label: 'Epson' }];

function Layout(props: { values?: Partial<PrinterFormValues>; vendors?: boolean }) {
	const form = useForm<PrinterFormValues>({
		defaultValues: { ...DEFAULT_FORM_VALUES, ...props.values },
	});
	return (
		<PrinterDialogLayout
			form={form}
			open
			onOpenChange={jest.fn()}
			connectionRow={<span data-testid="printer-row-connection" />}
			connectionLane={<span data-testid="lane" />}
			vendorOptions={props.vendors ? VENDORS : undefined}
			footer={{}}
		/>
	);
}

const rowIDs = () =>
	screen
		.getAllByTestId(/^printer-row-/)
		.map((row) => row.getAttribute('data-testid')?.replace('printer-row-', ''));

describe('Edit Printer rows', () => {
	it.each([true, false])(
		'is one list of rows in the board order, no fold (vendor %s)',
		(vendors) => {
			render(<Layout vendors={vendors} values={{ language: 'star-prnt' }} />);

			expect(rowIDs()).toEqual([
				'name',
				'connection',
				...(vendors ? ['vendor'] : []),
				'language',
				'columns',
				'autoCut',
				'autoOpenDrawer',
				'isDefault',
				'fullReceiptRaster',
			]);
			expect(screen.getByTestId('printer-row-fullReceiptRaster')).toHaveTextContent(
				'Print receipts as an image'
			);
			expect(screen.getByTestId('printer-row-fullReceiptRaster')).toHaveTextContent(
				'For scripts the printer cannot render (Arabic, Hebrew, Thai). Slower and larger than text.'
			);
			expect(screen.getByTestId('add-printer-raster-toggle')).toBeInTheDocument();
			expect(screen.queryByTestId('add-printer-advanced-trigger')).toBeNull();
		}
	);

	it('adds the Receipt language row while the language is ESC/POS', () => {
		render(<Layout values={{ language: 'esc-pos' }} />);

		expect(rowIDs()).toContain('codePage');
		expect(screen.getByTestId('printer-row-codePage')).toHaveTextContent('Receipt language');
	});

	it('nests the drawer connector under its switch, indented, only while the switch is on', () => {
		const { unmount } = render(<Layout values={{ autoOpenDrawer: true }} />);

		const ids = rowIDs();
		expect(ids[ids.indexOf('autoOpenDrawer') + 1]).toBe('drawerConnector');
		expect(screen.getByTestId('add-printer-drawer-connector-field')).toBeInTheDocument();
		expect(screen.getByText('Cash drawer connector').parentElement).toHaveClass('pl-4');
		unmount();

		render(<Layout values={{ autoOpenDrawer: false }} />);
		expect(rowIDs()).not.toContain('drawerConnector');
		expect(screen.queryByTestId('add-printer-drawer-connector-field')).toBeNull();
	});
});
