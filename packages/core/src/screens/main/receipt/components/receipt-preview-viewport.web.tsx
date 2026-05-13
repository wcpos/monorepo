import * as React from 'react';

import {
	getReceiptPreviewPaperWidth,
	PAPER_DIMENSIONS,
	pickAutoFitZoom,
	PREVIEW_ZOOM_STEPS,
	type PreviewPaperWidth,
	type PreviewZoom,
} from './receipt-preview-viewport-utils';

export { getReceiptPreviewPaperWidth, PAPER_DIMENSIONS, PREVIEW_ZOOM_STEPS };

const CANVAS_PAD_PX = 12;

interface ReceiptPreviewViewportProps {
	children: React.ReactNode;
	paperWidth: PreviewPaperWidth;
	zoomInLabel: string;
	zoomOutLabel: string;
	testID?: string;
}

export function ReceiptPreviewViewport({
	children,
	paperWidth,
	zoomInLabel,
	zoomOutLabel,
	testID,
}: ReceiptPreviewViewportProps) {
	const containerRef = React.useRef<HTMLDivElement>(null);
	const { width: paperW, height: paperH } = PAPER_DIMENSIONS[paperWidth];
	const [zoom, setZoom] = React.useState<PreviewZoom>(100);
	const autoFitDoneRef = React.useRef(false);

	React.useLayoutEffect(() => {
		autoFitDoneRef.current = false;
		const el = containerRef.current;
		if (!el) return;
		const applyAutoFit = () => {
			if (autoFitDoneRef.current) return;
			const availW = el.clientWidth - CANVAS_PAD_PX * 2;
			const availH = el.clientHeight - CANVAS_PAD_PX * 2;
			if (availW <= 0 || availH <= 0) return;
			autoFitDoneRef.current = true;
			setZoom(pickAutoFitZoom(paperW, paperH, availW, availH));
		};

		applyAutoFit();
		if (autoFitDoneRef.current || typeof ResizeObserver === 'undefined') return;

		const resizeObserver = new ResizeObserver(applyAutoFit);
		resizeObserver.observe(el);
		return () => resizeObserver.disconnect();
	}, [paperW, paperH]);

	const scale = zoom / 100;
	const currentIndex = PREVIEW_ZOOM_STEPS.indexOf(zoom);
	const canZoomOut = currentIndex > 0;
	const canZoomIn = currentIndex < PREVIEW_ZOOM_STEPS.length - 1;
	const stepZoom = (delta: number) => {
		const next = Math.max(0, Math.min(PREVIEW_ZOOM_STEPS.length - 1, currentIndex + delta));
		setZoom(PREVIEW_ZOOM_STEPS[next]);
	};

	const buttonClass =
		'flex h-7 w-7 cursor-pointer items-center justify-center border-0 bg-transparent text-base leading-none text-foreground hover:bg-muted disabled:cursor-default disabled:text-muted-foreground/50 disabled:hover:bg-transparent';

	return (
		<div
			ref={containerRef}
			data-testid={testID}
			className="bg-muted relative flex min-h-0 flex-1 flex-col rounded-md border"
		>
			<div
				data-testid={testID ? `${testID}-zoom-controls` : undefined}
				className="bg-background/95 absolute top-2 right-2 z-10 inline-flex items-stretch overflow-hidden rounded-md border shadow-sm"
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
						width: paperW * scale,
						height: paperH * scale,
					}}
				>
					<div
						data-testid={testID ? `${testID}-canvas` : undefined}
						style={{
							width: paperW,
							height: paperH,
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
