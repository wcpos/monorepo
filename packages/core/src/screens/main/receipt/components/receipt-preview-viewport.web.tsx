import * as React from 'react';

import {
	type ContentSize,
	getReceiptPreviewPaperWidth,
	MAX_PREVIEW_ZOOM,
	MIN_PREVIEW_ZOOM,
	PAPER_DIMENSIONS,
	pickAutoFitZoom,
	PREVIEW_ZOOM_STEPS,
	type PreviewPaperWidth,
	stepPreviewZoom,
} from './receipt-preview-viewport-utils';

export { getReceiptPreviewPaperWidth, PAPER_DIMENSIONS, PREVIEW_ZOOM_STEPS };

const CANVAS_PAD_PX = 12;

interface ReceiptPreviewViewportProps {
	children: React.ReactNode;
	paperWidth: PreviewPaperWidth;
	/** Measured size of the rendered document; paper dimensions are used until it is known. */
	contentSize?: ContentSize | null;
	zoomInLabel: string;
	zoomOutLabel: string;
	testID?: string;
}

export function ReceiptPreviewViewport({
	children,
	paperWidth,
	contentSize,
	zoomInLabel,
	zoomOutLabel,
	testID,
}: ReceiptPreviewViewportProps) {
	const containerRef = React.useRef<HTMLDivElement>(null);
	const fallback = PAPER_DIMENSIONS[paperWidth];
	const canvasW = contentSize?.width ?? fallback.width;
	const canvasH = contentSize?.height ?? fallback.height;
	// A whole percent: the width fit is rarely one of the steps the controls walk.
	const [zoom, setZoom] = React.useState<number>(100);
	const userPickedRef = React.useRef(false);

	// Fill the viewport's width until the user picks a zoom; the height scrolls.
	// Re-runs when the measured content width changes (so a freshly measured frame
	// gets fitted) and observes the container so a modal that first lays out at
	// 0×0 is still fitted once it has real dimensions.
	React.useLayoutEffect(() => {
		if (userPickedRef.current) return;
		const el = containerRef.current;
		if (!el) return;
		const applyAutoFit = () => {
			if (userPickedRef.current) return;
			const availW = el.clientWidth - CANVAS_PAD_PX * 2;
			if (availW <= 0) return;
			setZoom(pickAutoFitZoom(canvasW, availW));
		};

		applyAutoFit();
		if (typeof ResizeObserver === 'undefined') return;

		const resizeObserver = new ResizeObserver(applyAutoFit);
		resizeObserver.observe(el);
		return () => resizeObserver.disconnect();
	}, [canvasW]);

	const scale = zoom / 100;
	const canZoomOut = zoom > MIN_PREVIEW_ZOOM;
	const canZoomIn = zoom < MAX_PREVIEW_ZOOM;
	const stepZoom = (delta: 1 | -1) => {
		userPickedRef.current = true;
		setZoom(stepPreviewZoom(zoom, delta));
	};

	const buttonClass =
		'flex h-7 w-7 cursor-pointer items-center justify-center border-0 bg-transparent text-base leading-none text-foreground hover:bg-accent disabled:cursor-default disabled:text-muted-foreground/50 disabled:hover:bg-transparent';

	return (
		<div
			ref={containerRef}
			data-testid={testID}
			className="bg-muted relative flex min-h-0 flex-1 flex-col rounded-md border"
		>
			<div
				data-testid={testID ? `${testID}-zoom-controls` : undefined}
				className="bg-background/95 absolute top-2 right-2 z-10 inline-flex items-stretch overflow-hidden rounded-lg border"
			>
				<button
					type="button"
					aria-label={zoomOutLabel}
					title={zoomOutLabel}
					disabled={!canZoomOut}
					onClick={() => stepZoom(-1)}
					className={buttonClass}
				>
					&minus;
				</button>
				<span
					data-testid={testID ? `${testID}-zoom-value` : undefined}
					className="text-foreground inline-flex min-w-[44px] items-center justify-center border-r border-l px-2 text-xs tabular-nums"
					role="status"
					aria-live="polite"
				>
					{zoom}%
				</span>
				<button
					type="button"
					aria-label={zoomInLabel}
					title={zoomInLabel}
					disabled={!canZoomIn}
					onClick={() => stepZoom(1)}
					className={buttonClass}
				>
					+
				</button>
			</div>
			<div
				data-testid={testID ? `${testID}-scroll-area` : undefined}
				className="min-h-0 flex-1 overflow-auto p-3"
			>
				<div
					data-testid={testID ? `${testID}-canvas-frame` : undefined}
					className="mx-auto overflow-hidden bg-white shadow-sm"
					style={{
						width: canvasW * scale,
						height: canvasH * scale,
					}}
				>
					<div
						data-testid={testID ? `${testID}-canvas` : undefined}
						style={{
							width: canvasW,
							height: canvasH,
							transform: `scale(${scale})`,
							transformOrigin: 'top left',
						}}
					>
						{children}
					</div>
				</div>
			</div>
		</div>
	);
}
