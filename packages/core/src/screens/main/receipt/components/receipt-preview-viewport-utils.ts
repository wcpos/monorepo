export const DEFAULT_RECEIPT_PREVIEW_ZOOMS = [50, 75, 100] as const;

export type ReceiptPreviewZoom = (typeof DEFAULT_RECEIPT_PREVIEW_ZOOMS)[number];

export interface ReceiptPreviewTemplateMetadata {
	output_type?: string | null;
	paper_width?: string | null;
}

export function isReceiptPreviewZoom(zoom: number, zoomOptions: readonly number[]): boolean {
	return zoomOptions.includes(zoom);
}

export function getDefaultReceiptPreviewZoom({
	output_type,
	paper_width,
}: ReceiptPreviewTemplateMetadata): ReceiptPreviewZoom {
	if (output_type === 'escpos') return 100;
	if (paper_width === '58mm' || paper_width === '80mm') return 100;
	if (output_type === 'html') return 75;
	return 100;
}
