import { type StoreAuthorization, storeRequestOptions } from './probe-credential';

import type { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * A wc/v3 or wp/v2 request under either permalink style: /wp-json/ first, then ?rest_route=
 * on WordPress's 404. Writes tunnel through POST with `_method`, as the app's http client does
 * (WAF and CRS method policies refuse PUT and DELETE). A transport error is rethrown without
 * its message: a query-auth store puts the JWT in the URL.
 */
export async function storeApi(
	request: APIRequestContext,
	storeUrl: string,
	authorization: StoreAuthorization,
	method: 'get' | 'put' | 'delete',
	route: string,
	data?: unknown
): Promise<APIResponse> {
	const { headers, params } = storeRequestOptions(authorization);
	const tunnel: Record<string, string> = method === 'get' ? {} : { _method: method.toUpperCase() };
	const send = (url: string, extra: Record<string, string>) =>
		method === 'get'
			? request.get(url, { headers, params: { ...params, ...extra } })
			: request.post(url, { headers, params: { ...params, ...extra, ...tunnel }, data });
	const base = storeUrl.replace(/\/+$/, '');
	try {
		const pretty = await send(`${base}/wp-json${route}`, {});
		if (pretty.status() !== 404) return pretty;
		return await send(`${base}/index.php`, { rest_route: route });
	} catch {
		throw new Error(`${method.toUpperCase()} ${route}: transport error`);
	}
}
