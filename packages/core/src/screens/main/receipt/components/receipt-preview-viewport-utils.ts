export const PREVIEW_ZOOM_STEPS = [
	10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200,
] as const;

export type PreviewZoom = (typeof PREVIEW_ZOOM_STEPS)[number];

export type PreviewPaperWidth = 'a4' | '58mm' | '80mm';

export interface ContentSize {
	width: number;
	height: number;
}

/**
 * True paper dimensions in CSS px. Used as the preview size until the rendered
 * document has been measured — the measured content size takes over once known.
 */
export const PAPER_DIMENSIONS: Record<PreviewPaperWidth, ContentSize> = {
	a4: { width: 794, height: 1123 },
	'58mm': { width: 219, height: 520 },
	'80mm': { width: 302, height: 520 },
};

export interface ReceiptPreviewTemplateMetadata {
	output_type?: string | null;
	paper_width?: string | null;
}

export function getReceiptPreviewPaperWidth({
	output_type,
	paper_width,
}: ReceiptPreviewTemplateMetadata): PreviewPaperWidth {
	if (paper_width === '58mm') return '58mm';
	if (paper_width === '80mm') return '80mm';
	if (output_type === 'escpos') return '80mm';
	return 'a4';
}

export const MIN_PREVIEW_ZOOM: PreviewZoom = PREVIEW_ZOOM_STEPS[0];
export const MAX_PREVIEW_ZOOM: PreviewZoom = PREVIEW_ZOOM_STEPS[PREVIEW_ZOOM_STEPS.length - 1];

/**
 * The zoom that fills the viewport's width. A receipt is read top to bottom, so the height
 * scrolls and the width is the fit, on every print preview (Paul, 2026-10-30): fitting the
 * height too left an A4 page at 60% in a pane that held 70%. A whole percent, rounded down, so
 * the frame never overflows the width by a sub-pixel; bounded by the control's own range.
 */
export function pickAutoFitZoom(paperW: number, availW: number): number {
	if (availW <= 0 || paperW <= 0) return 100;
	const fill = Math.floor((availW / paperW) * 100);
	return Math.max(MIN_PREVIEW_ZOOM, Math.min(MAX_PREVIEW_ZOOM, fill));
}

/** The step above or below a zoom that need not be a step itself (the width fit rarely is). */
export function stepPreviewZoom(zoom: number, delta: 1 | -1): PreviewZoom {
	if (delta > 0) return PREVIEW_ZOOM_STEPS.find((z) => z > zoom) ?? MAX_PREVIEW_ZOOM;
	return [...PREVIEW_ZOOM_STEPS].reverse().find((z) => z < zoom) ?? MIN_PREVIEW_ZOOM;
}
