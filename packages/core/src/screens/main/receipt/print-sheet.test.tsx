/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { PrintSheet, PrintSheetContent } from './print-sheet';

import type { PrintSheetProps } from './print-sheet';

jest.mock('../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../jest/translate').createTestT(),
}));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) =>
		open ? children : null,
	DialogContent: ({ children, testID }: React.PropsWithChildren<{ testID: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
	DialogHeader: ({ children }: React.PropsWithChildren) => <header>{children}</header>,
	DialogTitle: ({ children }: React.PropsWithChildren) => <h1>{children}</h1>,
	DialogDescription: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
	DialogBody: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DialogFooter: jest.requireActual('../../../../jest/footer.test-utils').DialogFooter,
	DismissIsClose: jest.requireActual('../../../../jest/footer.test-utils').DismissIsClose,
}));
jest.mock('uniwind', () => ({ useCSSVariable: () => [] }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/vstack', () => ({ VStack: jest.requireActual('react-native').View }));
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/components/webview', () => ({ WebView: () => <iframe title="Preview" /> }));
jest.mock('./components/receipt-preview-viewport', () => ({
	ReceiptPreviewViewport: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('./mismatch-badge', () => ({ MismatchBadge: () => null }));
jest.mock('./syncing-badge', () => ({ SyncingBadge: () => null }));
jest.mock('./template-switcher', () => ({
	TemplateSwitcher: () => <button data-testid="receipt-template-select" />,
}));
jest.mock('./printer-switcher', () => ({
	PrinterSwitcher: () => <button data-testid="receipt-printer-select" />,
}));

const props = (): PrintSheetProps => ({
	doc: {
		templates: [{ id: 7, title: 'Standard receipt' }],
		allPrinters: [],
		printedTo: null,
		printHeld: false,
		isPrinting: false,
		isSyncing: false,
		previewProps: { renderedHtml: '<b>Receipt</b>', previewPaperWidth: 'a4' },
	} as unknown as PrintSheetProps['doc'],
	title: 'Receipt',
	description: 'Order #42',
	printLabel: 'Print receipt',
	onPrint: jest.fn(),
});

// Removing the primary slot or forgetting printedTo hides the sheet's next action.
it('names the document, its scope and its primary print action', () => {
	const content = props();
	const view = render(<PrintSheetContent {...content} />);
	expect(screen.getByRole('heading').textContent).toBe('Receipt');
	expect(screen.getByText('Order #42')).toBeTruthy();
	const print = screen.getByTestId('print-sheet-print');
	expect(print.textContent).toBe('Print receipt');
	expect(print.dataset.variant).toBe('default');
	fireEvent.click(print);
	expect(content.onPrint).toHaveBeenCalledTimes(1);
	view.rerender(<PrintSheetContent {...content} doc={{ ...content.doc, printedTo: 'Front' }} />);
	expect(print.textContent).toBe('Print again');
});

// A loading or held document must never offer an active Print.
it('shows the reason Print waits and the document error', () => {
	const content = props();
	const view = render(
		<PrintSheetContent {...content} waiting="Loading templates" error="Printer unavailable" />
	);
	expect(screen.getByTestId('print-sheet-waiting').textContent).toBe('Loading templates');
	expect(screen.getByTestId('print-sheet-error').textContent).toBe('Printer unavailable');
	expect((screen.getByTestId('print-sheet-print') as HTMLButtonElement).disabled).toBe(true);
	fireEvent.click(screen.getByTestId('print-sheet-print'));
	expect(content.onPrint).not.toHaveBeenCalled();
	view.rerender(<PrintSheetContent {...content} doc={{ ...content.doc, printHeld: true }} />);
	expect((screen.getByTestId('print-sheet-print') as HTMLButtonElement).disabled).toBe(true);
	expect(screen.queryByTestId('print-sheet-waiting')).toBeNull();
	expect(screen.queryByTestId('print-sheet-error')).toBeNull();
	view.rerender(<PrintSheetContent {...content} />);
	expect((screen.getByTestId('print-sheet-print') as HTMLButtonElement).disabled).toBe(false);
});
it.each(['isPrinting', 'isSyncing'] as const)('shows loading while %s', (field) => {
	const content = props();
	render(<PrintSheetContent {...content} doc={{ ...content.doc, [field]: true }} />);
	expect(screen.getByTestId('print-sheet-print').dataset.loading).toBe('true');
});

// Sync must not compete with Print, and extras must remain available.
it('keeps record and secondary actions outlined and preserves receipt selectors', () => {
	render(
		<PrintSheetContent
			{...props()}
			close={{ testID: 'receipt-close-button' }}
			printTestID="receipt-print-button"
			record={{ label: 'Sync', testID: 'sync' }}
			secondary={[
				{ label: 'Email receipt', testID: 'email' },
				{ label: 'Download PDF', testID: 'pdf' },
			]}
		/>
	);
	for (const id of ['sync', 'email', 'pdf', 'receipt-close-button'])
		expect(screen.getByTestId(id).dataset.variant).toBe('outline');
	expect(screen.getByTestId('receipt-print-button').dataset.variant).toBe('default');
});

// A single template and no printer still have visible values, never empty selectors.
it('shows read-only property values when there are no choices', () => {
	render(<PrintSheetContent {...props()} />);
	expect(screen.getByTestId('print-sheet-template').textContent).toBe('TemplateStandard receipt');
	expect(screen.getByTestId('print-sheet-printer').textContent).toBe('PrinterBrowser print dialog');
	expect(screen.queryByTestId('receipt-template-select')).toBeNull();
	expect(screen.queryByTestId('receipt-printer-select')).toBeNull();
});

it('leaves the template value empty while templates load', () => {
	const content = props();
	render(<PrintSheetContent {...content} doc={{ ...content.doc, templates: [] }} />);
	expect(screen.getByTestId('print-sheet-template').textContent).toBe('Template');
});

// A controlled door must not show its sheet before the cashier opens it.
it('renders the controlled sheet only while open', () => {
	const content = props();
	const view = render(<PrintSheet {...content} open={false} onOpenChange={jest.fn()} />);
	expect(screen.queryByTestId('print-sheet')).toBeNull();
	view.rerender(<PrintSheet {...content} open onOpenChange={jest.fn()} />);
	expect(screen.getByTestId('print-sheet')).toBeTruthy();
});
