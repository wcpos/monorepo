import { orderDocumentFromWooPayload } from '../scheduler';

export async function fetchOrderServerRevision(input: {
	fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
	syncBaseUrl: string;
	wooOrderId: number;
}): Promise<string | null> {
	const response = await input.fetch(
		`${input.syncBaseUrl}/orders?include=${input.wooOrderId}&per_page=1&orderby=include`
	);
	if (!response.ok) throw new Error(`revision refresh failed: HTTP ${response.status}`);
	const [payload] = (await response.json()) as Record<string, unknown>[];
	if (!payload) return null;
	return orderDocumentFromWooPayload(payload as never).sync.revision || null;
}
