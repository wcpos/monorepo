/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { PrinterDialogLayout } from './printer-dialog-layout';
import { type PrinterDetection } from './printer-rows';
import { DEFAULT_FORM_VALUES, type PrinterFormValues, type VendorOption } from '../schema';

type Field = { value?: unknown; onChange: (value: unknown) => void; testID?: string };

jest.mock('react-native', () => ({
	useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
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
		// Each stub records the values of the list it was handed.
		FormSelect: (props: { options?: { value: string }[] }) => (
			<span
				data-testid="select"
				data-values={(props.options ?? []).map((option) => option.value).join(',')}
			/>
		),
		SavedMark: () => null,
		useSavedName: () => '',
	};
});
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<span data-testid={testID}>{children}</span>
	),
	TextClassContext: jest.requireActual('react').createContext(''),
}));
// The button renders so a row's verb (Change) can be found and pressed.
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
	}: React.PropsWithChildren<{ testID?: string; onPress?: () => void }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('../../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));

const VENDORS: VendorOption[] = [{ value: 'epson', label: 'Epson' }];

function Layout(props: {
	values?: Partial<PrinterFormValues>;
	vendors?: boolean;
	detected?: PrinterDetection;
}) {
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
			detected={props.detected}
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

	it('hands every select row its own list', () => {
		render(<Layout vendors values={{ language: 'esc-pos', autoOpenDrawer: true }} />);
		const lists = screen.getAllByTestId('select').map((el) => el.getAttribute('data-values'));
		expect(lists).toEqual([
			'epson',
			'esc-pos,star-prnt,star-line',
			'32,42,48,64',
			expect.stringMatching(/^auto,cp437,/),
			'pin2,pin5',
		]);
	});

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
		expect(screen.getByText('Cash drawer connector').parentElement).toHaveAttribute(
			'data-indent',
			'true'
		);
		unmount();

		render(<Layout values={{ autoOpenDrawer: false }} />);
		expect(rowIDs()).not.toContain('drawerConnector');
		expect(screen.queryByTestId('add-printer-drawer-connector-field')).toBeNull();
	});
});

describe('Edit Printer detected rows', () => {
	const detected: PrinterDetection = { language: 'esc-pos', columns: 42 };
	const languageRow = () => screen.getByTestId('printer-row-language');
	const paperRow = () => screen.getByTestId('printer-row-columns');

	it('reads the detected language and paper as values with "detected" and Change, no select', () => {
		render(<Layout detected={detected} values={{ language: 'esc-pos', columns: 42 }} />);

		expect(languageRow()).toHaveTextContent('ESC/POS');
		expect(languageRow()).toHaveTextContent('detected');
		expect(within(languageRow()).getByTestId('printer-language-change')).toHaveTextContent(
			'Change'
		);
		expect(within(languageRow()).queryByTestId('select')).toBeNull();
		expect(paperRow()).toHaveTextContent('42 — 80 mm, older printers');
		expect(paperRow()).toHaveTextContent('detected');
		expect(within(paperRow()).getByTestId('printer-columns-change')).toHaveTextContent('Change');
		expect(within(paperRow()).queryByTestId('select')).toBeNull();
	});

	it('opens the select when Change is pressed', () => {
		render(<Layout detected={detected} values={{ language: 'esc-pos', columns: 42 }} />);

		fireEvent.click(screen.getByTestId('printer-language-change'));

		expect(within(languageRow()).getByTestId('select')).toBeInTheDocument();
		expect(within(languageRow()).queryByTestId('printer-language-change')).toBeNull();
		expect(within(paperRow()).queryByTestId('select')).toBeNull();
	});

	it('renders both rows as selects when nothing was detected', () => {
		render(<Layout values={{ language: 'esc-pos', columns: 42 }} />);

		expect(within(languageRow()).getByTestId('select')).toBeInTheDocument();
		expect(within(paperRow()).getByTestId('select')).toBeInTheDocument();
		expect(languageRow()).not.toHaveTextContent('detected');
	});

	it('renders the select when the form no longer holds the detected language', () => {
		render(<Layout detected={detected} values={{ language: 'star-prnt', columns: 42 }} />);

		expect(within(languageRow()).getByTestId('select')).toBeInTheDocument();
		expect(languageRow()).not.toHaveTextContent('detected');
	});
});
