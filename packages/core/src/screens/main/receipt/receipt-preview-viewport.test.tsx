/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import {
	DEFAULT_RECEIPT_PREVIEW_ZOOMS,
	getDefaultReceiptPreviewZoom,
	ReceiptPreviewViewport,
} from './components/receipt-preview-viewport.web';

describe('ReceiptPreviewViewport', () => {
	it('renders children inside a top-left anchored scaled preview canvas', () => {
		render(
			<ReceiptPreviewViewport defaultZoom={75} label="Preview zoom" testID="receipt-preview">
				<div data-testid="receipt-webview">Receipt frame</div>
			</ReceiptPreviewViewport>
		);

		expect(screen.getByTestId('receipt-webview')).toBeInTheDocument();
		expect(screen.getByTestId('receipt-preview-canvas')).toHaveStyle({
			transform: 'scale(0.75)',
			transformOrigin: 'top left',
		});
		expect(screen.getByTestId('receipt-preview-canvas')).toHaveClass('flex');
	});

	it('switches between the supported receipt preview zooms', () => {
		render(
			<ReceiptPreviewViewport defaultZoom={75} label="Preview zoom" testID="receipt-preview">
				<div data-testid="receipt-webview">Receipt frame</div>
			</ReceiptPreviewViewport>
		);

		expect(DEFAULT_RECEIPT_PREVIEW_ZOOMS).toEqual([50, 75, 100]);
		expect(screen.getByRole('button', { name: '75%' })).toHaveAttribute('aria-pressed', 'true');

		fireEvent.click(screen.getByRole('button', { name: '50%' }));

		expect(screen.getByRole('button', { name: '50%' })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByTestId('receipt-preview-canvas')).toHaveStyle({ transform: 'scale(0.5)' });
	});

	it('defaults browser/html templates to 75%', () => {
		expect(getDefaultReceiptPreviewZoom({ output_type: 'html', paper_width: null })).toBe(75);
	});

	it('defaults thermal templates and thermal paper widths to 100%', () => {
		expect(getDefaultReceiptPreviewZoom({ output_type: 'escpos', paper_width: null })).toBe(100);
		expect(getDefaultReceiptPreviewZoom({ output_type: 'html', paper_width: '58mm' })).toBe(100);
		expect(getDefaultReceiptPreviewZoom({ output_type: undefined, paper_width: '80mm' })).toBe(100);
	});

	it('defaults unknown template metadata to 100%', () => {
		expect(getDefaultReceiptPreviewZoom({ output_type: undefined, paper_width: null })).toBe(100);
	});

	it('resets manual zoom when the selected template default changes', () => {
		const { rerender } = render(
			<ReceiptPreviewViewport defaultZoom={75} label="Preview zoom" testID="receipt-preview">
				<div data-testid="receipt-webview">Receipt frame</div>
			</ReceiptPreviewViewport>
		);

		fireEvent.click(screen.getByRole('button', { name: '50%' }));
		expect(screen.getByRole('button', { name: '50%' })).toHaveAttribute('aria-pressed', 'true');

		rerender(
			<ReceiptPreviewViewport defaultZoom={100} label="Preview zoom" testID="receipt-preview">
				<div data-testid="receipt-webview">Receipt frame</div>
			</ReceiptPreviewViewport>
		);

		expect(screen.getByRole('button', { name: '100%' })).toHaveAttribute('aria-pressed', 'true');
	});
});
