/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { ReceiptBody } from './receipt-body';

import type { useReceiptDocument } from './use-receipt-document';

jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/vstack', () => ({ VStack: jest.requireActual('react-native').View }));
jest.mock('@wcpos/components/hstack', () => ({ HStack: jest.requireActual('react-native').View }));
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('@wcpos/components/webview', () => ({
	WebView: ({ testID, srcDoc }: { testID: string; srcDoc: string }) => (
		<iframe data-testid={testID} srcDoc={srcDoc} />
	),
}));
jest.mock('./components/receipt-preview-viewport', () => ({
	ReceiptPreviewViewport: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="paper-viewport">{children}</div>
	),
}));
jest.mock('./mismatch-badge', () => ({ MismatchBadge: () => null }));
jest.mock('./syncing-badge', () => ({ SyncingBadge: () => null }));
jest.mock('./template-switcher', () => ({ TemplateSwitcher: () => null }));
jest.mock('./printer-switcher', () => ({ PrinterSwitcher: () => null }));

// Revert: always fit the document into the thumbnail viewport instead of sizing its frame.
it('renders a full-width document at its measured height without the paper zoom viewport', () => {
	const doc = {
		previewProps: { renderedHtml: '<b>Closure</b>', contentSize: { width: 420, height: 900 } },
	} as ReturnType<typeof useReceiptDocument>;
	const view = render(<ReceiptBody doc={doc} hideSelects fullWidth />);
	expect(screen.queryByTestId('paper-viewport')).toBeNull();
	expect(screen.getByTestId('receipt-flow-preview').style.width).toBe('100%');
	expect(screen.getByTestId('receipt-flow-preview').style.height).toBe('900px');
	expect(screen.getByTestId('receipt-preview-frame').getAttribute('srcdoc')).toBe('<b>Closure</b>');
	view.rerender(
		<ReceiptBody
			doc={{ ...doc, previewProps: { ...doc.previewProps, contentSize: null } }}
			hideSelects
			fullWidth
		/>
	);
	expect(screen.getByTestId('receipt-flow-preview').style.height).toBe('384px');
});

it('retains the paper viewport for the existing receipt presentation', () => {
	const doc = { previewProps: { renderedHtml: '<b>Receipt</b>' } } as ReturnType<
		typeof useReceiptDocument
	>;
	render(<ReceiptBody doc={doc} />);
	expect(screen.getByTestId('paper-viewport')).toBeTruthy();
});
