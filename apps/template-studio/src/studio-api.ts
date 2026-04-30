import type { PaperWidth, ReceiptFixture, StudioTemplate, TemplateEngine } from './studio-core';

export async function fetchBundledTemplates(): Promise<StudioTemplate[]> {
	const response = await fetch('/__studio/templates', { credentials: 'include' });
	if (!response.ok) throw new Error(`Failed to load bundled templates: ${response.status}`);
	return response.json();
}

export async function fetchFixtures(): Promise<ReceiptFixture[]> {
	const response = await fetch('/__studio/fixtures', { credentials: 'include' });
	if (!response.ok) throw new Error(`Failed to load fixtures: ${response.status}`);
	return response.json();
}

export async function fetchWpPreview(
	templateId: string | number
): Promise<StudioTemplate & { receiptData: ReceiptFixture }> {
	const encodedTemplateId = encodeURIComponent(String(templateId));
	const response = await fetch(
		`/wp-json/wcpos/v1/templates/${encodedTemplateId}/preview?include_legacy_html=1`,
		{
			credentials: 'include',
			headers: { 'X-WCPOS': '1' },
		}
	);
	if (!response.ok) throw new Error(`Failed to load wp-env preview: ${response.status}`);
	const payload = (await response.json()) as {
		engine: TemplateEngine;
		template_content: string;
		receipt_data: ReceiptFixture;
		template_id: string | number;
		preview_html?: string;
	};
	return {
		id: String(payload.template_id),
		name: `wp-env template ${payload.template_id}`,
		engine: payload.engine,
		source: 'wp-env',
		content: payload.template_content,
		previewHtml: payload.preview_html,
		receiptData: { ...payload.receipt_data, id: `wp-env-${payload.template_id}` },
	};
}

export const paperWidths: PaperWidth[] = ['58mm', '80mm', 'a4'];
