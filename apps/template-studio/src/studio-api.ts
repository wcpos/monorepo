import type { ReceiptFixture, StudioTemplate, TemplateEngine } from './studio-core';

export interface DisplayTemplate {
	id: string | number;
	title: string;
}

export type DisplayState =
	| 'idle'
	| 'cart'
	| 'cart.empty'
	| 'payment.started'
	| 'payment.approved'
	| 'payment.declined'
	| 'payment.complete';

/** Fetches the display templates available from the configured WordPress site. */
export async function fetchDisplayTemplates(): Promise<DisplayTemplate[]> {
	try {
		const response = await fetch('/wp-json/wcpos/v2/templates?type=display', {
			credentials: 'include',
		});
		if (!response.ok) return [];
		const templates = (await response.json()) as (DisplayTemplate & Record<string, unknown>)[];
		return templates.map(({ id, title }) => ({ id, title }));
	} catch {
		return [];
	}
}

/** Selection that previews the site's active display template without naming one. */
export const ACTIVE_DISPLAY_TEMPLATE: DisplayTemplate = {
	id: 'active',
	title: 'Active display template',
};

/** Builds a WordPress customer-display preview URL for a template and state. */
export function displayPreviewUrl(
	siteOrigin: string,
	templateId: string | number,
	state: DisplayState
): string {
	const url = new URL('/wcpos-display/', siteOrigin);
	url.searchParams.set('preview', state);
	if (templateId !== ACTIVE_DISPLAY_TEMPLATE.id)
		url.searchParams.set('template', String(templateId));
	return url.toString();
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The configured WP origin is what the Vite server reaches. When the Studio is opened
 * from another machine, a loopback hostname must become the Studio's own hostname so
 * the browser can reach the display page.
 */
export function resolveDisplayOrigin(configuredOrigin: string, browserHostname: string): string {
	try {
		const url = new URL(configuredOrigin);
		if (LOOPBACK.has(url.hostname) && !LOOPBACK.has(browserHostname))
			url.hostname = browserHostname;
		return url.origin;
	} catch {
		return configuredOrigin;
	}
}

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
	const response = await fetch('/__studio/print/raw-tcp', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-WCPOS-Template-Studio': '1',
		},
		body: JSON.stringify(input),
	});
	if (!response.ok) {
		const message = (await response.text()).trim();
		throw new Error(`Raw TCP print failed: ${response.status}${message ? ` - ${message}` : ''}`);
	}
	return response.json();
}
