/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, screen, waitFor } from '@testing-library/react';

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

// Simulate native layout delivery through RN-web's ResizeObserver, not a fake ReceiptBody.
let resizeCallback: ResizeObserverCallback;
beforeAll(() => {
	window.ResizeObserver = class {
		constructor(callback: ResizeObserverCallback) {
			resizeCallback = callback;
		}
		observe() {}
		unobserve() {}
		disconnect() {}
	};
});
const originalResizeObserver = window.ResizeObserver;
afterAll(() => {
	window.ResizeObserver = originalResizeObserver;
});

// Revert: narrow the iframe without scaling its paper-sized canvas (the Counted column clips).
it('scales A4 content to the panel inner width and re-fits on resize', async () => {
	const doc = {
		previewProps: {
			renderedHtml: '<b>Closure</b>',
			previewPaperWidth: 'a4',
			contentSize: { width: 800, height: 1200 },
		},
	} as ReturnType<typeof useReceiptDocument>;
	const view = render(<ReceiptBody doc={doc} hideSelects fullWidth />);
	const frame = screen.getByTestId('receipt-flow-preview');
	Object.defineProperty(frame, 'offsetWidth', { configurable: true, value: 448 });
	act(() =>
		resizeCallback(
			[
				{
					target: frame,
					borderBoxSize: [],
					contentBoxSize: [],
					devicePixelContentBoxSize: [],
					contentRect: frame.getBoundingClientRect(),
				},
			],
			{} as ResizeObserver
		)
	);
	await waitFor(() => expect(parseFloat(frame.style.height)).toBeCloseTo(672));
	expect(frame.style.width).toBe('100%');
	expect(getComputedStyle(frame).overflowX).toBe('hidden');
	const canvas = screen.getByTestId('receipt-flow-canvas');
	expect(canvas.style.width).toBe('800px');
	expect(canvas.style.height).toBe('1200px');
	expect(canvas.style.transform).toBe('scale(0.56)');
	expect(canvas.style.transformOrigin).toBe('top left');
	expect(screen.getByTestId('receipt-preview-frame').getAttribute('srcdoc')).toBe('<b>Closure</b>');
	expect(screen.queryByTestId('paper-viewport')).toBeNull();

	Object.defineProperty(frame, 'offsetWidth', { configurable: true, value: 320 });
	act(() =>
		resizeCallback(
			[
				{
					target: frame,
					borderBoxSize: [],
					contentBoxSize: [],
					devicePixelContentBoxSize: [],
					contentRect: frame.getBoundingClientRect(),
				},
			],
			{} as ResizeObserver
		)
	);
	await waitFor(() => expect(canvas.style.transform).toBe('scale(0.4)'));
	expect(frame.style.height).toBe('480px');

	// Before content measurement, the A4 canvas still fits the available width.
	view.rerender(
		<ReceiptBody
			doc={{ ...doc, previewProps: { ...doc.previewProps, contentSize: null } }}
			hideSelects
			fullWidth
		/>
	);
	expect(canvas.style.width).toBe('794px');
	expect(canvas.style.transform).toBe(`scale(${320 / 794})`);
});

it('retains the paper viewport for the existing receipt presentation', () => {
	const doc = {
		previewProps: { renderedHtml: '<b>Receipt</b>', previewPaperWidth: 'a4' },
	} as ReturnType<typeof useReceiptDocument>;
	render(<ReceiptBody doc={doc} />);
	expect(screen.getByTestId('paper-viewport')).toBeTruthy();
});
