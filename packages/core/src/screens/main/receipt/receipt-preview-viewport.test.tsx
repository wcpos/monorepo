/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import {
	getReceiptPreviewPaperWidth,
	PAPER_DIMENSIONS,
	PREVIEW_ZOOM_STEPS,
	ReceiptPreviewViewport,
} from './components/receipt-preview-viewport.web';

const renderViewport = (
	paperWidth: 'a4' | '58mm' | '80mm' = 'a4',
	contentSize?: { width: number; height: number }
) =>
	render(
		<ReceiptPreviewViewport
			paperWidth={paperWidth}
			contentSize={contentSize}
			zoomInLabel="Zoom in"
			zoomOutLabel="Zoom out"
			testID="receipt-preview"
		>
			<div data-testid="receipt-webview">Receipt frame</div>
		</ReceiptPreviewViewport>
	);

describe('ReceiptPreviewViewport', () => {
	it('falls back to true paper dimensions until the content size is measured', () => {
		renderViewport('a4');

		expect(screen.getByTestId('receipt-webview')).toBeInTheDocument();

		const canvas = screen.getByTestId('receipt-preview-canvas');
		expect(canvas).toHaveStyle({
			width: `${PAPER_DIMENSIONS.a4.width}px`,
			height: `${PAPER_DIMENSIONS.a4.height}px`,
			transformOrigin: 'top left',
		});
	});

	it('sizes the canvas to the measured content size instead of paper dimensions', () => {
		renderViewport('80mm', { width: 360, height: 940 });

		expect(screen.getByTestId('receipt-preview-canvas')).toHaveStyle({
			width: '360px',
			height: '940px',
		});
	});

	it('shrinks the outer frame with the chosen zoom so the page is a true preview', () => {
		renderViewport('a4');

		fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));

		const value = screen.getByTestId('receipt-preview-zoom-value');
		const zoom = Number(value.textContent?.replace('%', ''));
		const scale = zoom / 100;
		expect(screen.getByTestId('receipt-preview-canvas-frame')).toHaveStyle({
			width: `${PAPER_DIMENSIONS.a4.width * scale}px`,
			height: `${PAPER_DIMENSIONS.a4.height * scale}px`,
		});
		expect(screen.getByTestId('receipt-preview-canvas')).toHaveStyle({
			transform: `scale(${scale})`,
		});
	});

	it('auto-fits to the measured content size when the container resizes', () => {
		const originalResizeObserver = window.ResizeObserver;
		let resizeCallback: ResizeObserverCallback | undefined;

		window.ResizeObserver = class ResizeObserver {
			constructor(callback: ResizeObserverCallback) {
				resizeCallback = callback;
			}
			observe = jest.fn();
			unobserve = jest.fn();
			disconnect = jest.fn();
		};

		try {
			renderViewport('a4', { width: 800, height: 2000 });

			const container = screen.getByTestId('receipt-preview');
			Object.defineProperty(container, 'clientWidth', { configurable: true, value: 424 });
			Object.defineProperty(container, 'clientHeight', { configurable: true, value: 624 });

			act(() => {
				resizeCallback?.([], {} as ResizeObserver);
			});

			// 800×2000 content fits the 400×600 available area at 30% (2000 × 0.3 = 600).
			expect(screen.getByTestId('receipt-preview-zoom-value')).toHaveTextContent('30%');
		} finally {
			window.ResizeObserver = originalResizeObserver;
		}
	});

	it('auto-fits after a zero-size initial measurement when the container resizes', () => {
		const originalResizeObserver = window.ResizeObserver;
		let resizeCallback: ResizeObserverCallback | undefined;

		window.ResizeObserver = class ResizeObserver {
			constructor(callback: ResizeObserverCallback) {
				resizeCallback = callback;
			}
			observe = jest.fn();
			unobserve = jest.fn();
			disconnect = jest.fn();
		};

		try {
			renderViewport('a4');

			const container = screen.getByTestId('receipt-preview');
			Object.defineProperty(container, 'clientWidth', { configurable: true, value: 421 });
			Object.defineProperty(container, 'clientHeight', { configurable: true, value: 586 });

			act(() => {
				resizeCallback?.([], {} as ResizeObserver);
			});

			expect(screen.getByTestId('receipt-preview-zoom-value')).toHaveTextContent('50%');
		} finally {
			window.ResizeObserver = originalResizeObserver;
		}
	});

	it('steps through the zoom levels with the + and − controls', () => {
		renderViewport('a4');

		const value = screen.getByTestId('receipt-preview-zoom-value');
		const initial = Number(value.textContent?.replace('%', ''));
		const initialIndex = PREVIEW_ZOOM_STEPS.indexOf(initial as (typeof PREVIEW_ZOOM_STEPS)[number]);
		expect(initialIndex).toBeGreaterThanOrEqual(0);

		fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
		expect(value.textContent).toBe(`${PREVIEW_ZOOM_STEPS[initialIndex + 1]}%`);

		fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
		expect(value.textContent).toBe(`${PREVIEW_ZOOM_STEPS[initialIndex]}%`);
	});

	it('disables zoom controls at the boundary steps', () => {
		renderViewport('a4');

		const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
		const zoomIn = screen.getByRole('button', { name: 'Zoom in' });

		for (let i = 0; i < PREVIEW_ZOOM_STEPS.length; i++) fireEvent.click(zoomOut);
		expect(zoomOut).toBeDisabled();
		expect(zoomIn).not.toBeDisabled();

		for (let i = 0; i < PREVIEW_ZOOM_STEPS.length; i++) fireEvent.click(zoomIn);
		expect(zoomIn).toBeDisabled();
		expect(zoomOut).not.toBeDisabled();
	});

	it('maps template metadata to the matching paper width', () => {
		expect(getReceiptPreviewPaperWidth({ output_type: 'html', paper_width: null })).toBe('a4');
		expect(getReceiptPreviewPaperWidth({ output_type: 'html', paper_width: '58mm' })).toBe('58mm');
		expect(getReceiptPreviewPaperWidth({ output_type: 'html', paper_width: '80mm' })).toBe('80mm');
		expect(getReceiptPreviewPaperWidth({ output_type: 'escpos', paper_width: null })).toBe('80mm');
		expect(getReceiptPreviewPaperWidth({ output_type: undefined, paper_width: null })).toBe('a4');
	});
});
