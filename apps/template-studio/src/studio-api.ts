import { debugError, debugInfo, debugLog } from './lib/debug-log';

import type { ReceiptFixture, StudioTemplate, TemplateEngine } from './studio-core';

export async function fetchBundledTemplates(): Promise<StudioTemplate[]> {
	const response = await fetch('/__studio/templates', { credentials: 'include' });
	if (!response.ok) throw new Error(`Failed to load bundled templates: ${response.status}`);
	return response.json();
}

export interface FetchWpPreviewInput {
	storeUrl?: string;
	templateId: string | number;
	orderId?: string | number;
}

export interface RawTcpPrintInput {
	host: string;
	port: number;
	data: string;
}

export interface RawTcpPrintResult {
	ok: boolean;
	bytesWritten: number;
}

export async function fetchWpPreview({
	storeUrl,
	templateId,
	orderId,
}: FetchWpPreviewInput): Promise<StudioTemplate & { receiptData: ReceiptFixture }> {
	const params = new URLSearchParams({
		template_id: String(templateId),
	});
	const normalizedStoreUrl = typeof storeUrl === 'string' ? storeUrl.trim() : '';
	if (normalizedStoreUrl) {
		params.set('store_url', normalizedStoreUrl);
	}
	const normalizedOrderId = orderId == null ? '' : String(orderId).trim();
	if (normalizedOrderId) {
		params.set('order_id', normalizedOrderId);
	}

	const response = await fetch(`/__studio/wp-preview?${params.toString()}`, {
		credentials: 'include',
		headers: { 'X-WCPOS': '1' },
	});
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
		receiptData: {
			...payload.receipt_data,
			id: `store-${payload.template_id}-${normalizedOrderId || 'sample'}`,
		},
	};
}

export async function printRawTcp(input: RawTcpPrintInput): Promise<RawTcpPrintResult> {
	debugInfo('studio-api', 'posting raw TCP payload', {
		host: input.host,
		port: input.port,
		base64Length: input.data.length,
	});
	const response = await fetch('/__studio/print/raw-tcp', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-WCPOS-Template-Studio': '1',
		},
		body: JSON.stringify(input),
	});
	debugLog('studio-api', 'raw TCP endpoint responded', {
		status: response.status,
		ok: response.ok,
		statusText: response.statusText,
	});
	if (!response.ok) {
		const message = (await response.text()).trim();
		debugError('studio-api', 'raw TCP endpoint rejected payload', {
			status: response.status,
			message,
			host: input.host,
			port: input.port,
			base64Length: input.data.length,
		});
		throw new Error(`Raw TCP print failed: ${response.status}${message ? ` - ${message}` : ''}`);
	}
	const result = (await response.json()) as RawTcpPrintResult;
	debugInfo('studio-api', 'raw TCP endpoint accepted payload', { ...result });
	return result;
}
