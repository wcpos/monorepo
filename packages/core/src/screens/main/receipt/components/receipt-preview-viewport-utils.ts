export const PREVIEW_ZOOM_STEPS = [
	10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200,
] as const;

export type PreviewZoom = (typeof PREVIEW_ZOOM_STEPS)[number];

export type PreviewPaperWidth = 'a4' | '58mm' | '80mm';

export const PAPER_DIMENSIONS: Record<PreviewPaperWidth, { width: number; height: number }> = {
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

export function pickAutoFitZoom(
	paperW: number,
	paperH: number,
	availW: number,
	availH: number
): PreviewZoom {
	if (availW <= 0 || availH <= 0) return 100;
	const candidates = PREVIEW_ZOOM_STEPS.filter((z) => z <= 100)
		.slice()
		.reverse();
	for (const z of candidates) {
		const s = z / 100;
		if (paperW * s <= availW && paperH * s <= availH) return z;
	}
	return candidates[candidates.length - 1];
}
