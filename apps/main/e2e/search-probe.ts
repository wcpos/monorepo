import { randomUUID } from 'crypto';

import { log } from '@wcpos/utils/logger';

import { type StoreAuthorization, storeRequestOptions } from './fixtures';

import type { APIRequestContext, Locator, Page } from '@playwright/test';

type ProbeCollection = 'products' | 'customers';
type SearchCollection = ProbeCollection | 'orders';

export interface SearchProbe {
	collection: ProbeCollection;
	id: number;
	rowTestId?: string;
	token: string;
}

export type RunPrivateProductKind = 'simple' | 'variable';
export interface RunPrivateProductProbe extends SearchProbe {
	variationSku?: string;
}

export type SearchProbeResult = { ok: true; probe: SearchProbe } | { ok: false; reason: string };

interface CreateSearchProbeOptions {
	request: APIRequestContext;
	storeUrl: string;
	authorization: StoreAuthorization | null;
	collection: ProbeCollection;
	workerIndex: number;
	/** True when CI declared product-writer secrets; failures must then fail, never skip. */
	writerConfigured?: boolean;
}

export function productWriterCredentialsConfigured(): boolean {
	return Boolean(process.env.E2E_PRODUCT_WRITER_USER && process.env.E2E_PRODUCT_WRITER_PASS);
}

export function productProbeFailureAction({
	writerConfigured,
}: {
	writerConfigured: boolean;
	status: number | null;
}): 'skip' | 'fail' {
	return writerConfigured ? 'fail' : 'skip';
}

/** A single alphanumeric FlexSearch token, unique across workers, retries and parallel runs. */
export function mintSearchProbeToken(workerIndex: number): string {
	return `zx${workerIndex.toString(36)}${Date.now().toString(36)}${randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

/**
 * Optional elevated credentials for the PRODUCTS probe. The plugin's `next`
 * deliberately keeps POS cashiers read-only on the catalog (Write_Controller's
 * pinned decision), so the demo user's create attempt 403s. When the CI store
 * provides an admin-capable WCPOS login via E2E_PRODUCT_WRITER_USER/_PASS, we
 * mint a JWT through the same wcpos-auth flow the app uses and create the probe
 * with it. Absent credentials → null → the caller falls back to the captured
 * auth, and a 403 surfaces as the spec's skip-with-reason.
 *
 * The token is never logged. Missing credentials return null; declared but
 * broken credentials throw so CI cannot disguise a provisioning failure as a skip.
 */
export async function productWriterAuthorization(
	request: APIRequestContext,
	storeUrl: string
): Promise<StoreAuthorization | null> {
	const user = process.env.E2E_PRODUCT_WRITER_USER;
	const pass = process.env.E2E_PRODUCT_WRITER_PASS;
	if (!user || !pass) return null;

	try {
		const authUrl = `${storeUrl.replace(/\/+$/, '')}/wcpos-auth/?redirect_uri=https://localhost/cb&state=e2e-search-probe`;
		const pageResponse = await request.get(authUrl);
		const html = await pageResponse.text();
		const nonce = /name="_wpnonce" value="([^"]+)"/.exec(html)?.[1];
		const session = /name="auth_session" value="([^"]+)"/.exec(html)?.[1];
		if (!nonce || !session) {
			throw new Error(`login form omitted auth fields (HTTP ${pageResponse.status()})`);
		}

		const submit = await request.post(authUrl, {
			form: {
				'wcpos-log': user,
				'wcpos-pwd': pass,
				_wpnonce: nonce,
				auth_session: session,
				'wcpos-submit': '1',
			},
			maxRedirects: 0,
		});
		const location = submit.headers()['location'] ?? '';
		const token = /access_token=([^&]+)/.exec(location)?.[1];
		if (!token) throw new Error(`login returned no access token (HTTP ${submit.status()})`);
		return { transport: 'header', value: `Bearer ${token}` };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log.warn('[search-probe] configured product-writer login failed');
		throw new Error(`Configured product-writer authentication failed: ${message}`);
	}
}

function collectionUrl(storeUrl: string, collection: ProbeCollection, id?: number): string {
	// wc/v3 accepts the captured Bearer JWT; query-param JWT auth may remain wcpos/v2-only.
	const base = `${storeUrl.replace(/\/+$/, '')}/wp-json/wc/v3/${collection}`;
	return id === undefined ? base : `${base}/${id}`;
}

/** The plain-permalink spelling of the same route: /index.php?rest_route=/wc/v3/… */
export function plainPermalinkUrl(
	storeUrl: string,
	collection: ProbeCollection,
	id?: number
): string {
	const route = id === undefined ? `/wc/v3/${collection}` : `/wc/v3/${collection}/${id}`;
	return `${storeUrl.replace(/\/+$/, '')}/index.php?rest_route=${route}`;
}

type ProbeRequestOptions = {
	headers: Record<string, string>;
	params: Record<string, string>;
	data?: unknown;
};

/**
 * Issue a wc/v3 request tolerating both permalink styles: try the pretty
 * /wp-json/ path first, and on WordPress's rest_no_route 404 retry the
 * plain-permalink ?rest_route= spelling. Without this, a plain-permalink store
 * would mis-report probe creation as a missing write capability and the search
 * specs would skip on a store they fully support.
 */
async function probeRequest(
	request: APIRequestContext,
	method: 'post' | 'delete',
	storeUrl: string,
	collection: ProbeCollection,
	id: number | undefined,
	options: ProbeRequestOptions
) {
	const pretty = await request[method](collectionUrl(storeUrl, collection, id), options);
	if (pretty.status() !== 404) return pretty;
	return request[method](plainPermalinkUrl(storeUrl, collection, id), options);
}

async function variationCreateRequest(
	request: APIRequestContext,
	storeUrl: string,
	authorization: StoreAuthorization,
	productId: number,
	data: unknown
) {
	const root = storeUrl.replace(/\/+$/, '');
	const options = { ...storeRequestOptions(authorization), data };
	const pretty = await request.post(
		`${root}/wp-json/wc/v3/products/${productId}/variations`,
		options
	);
	if (pretty.status() !== 404) return pretty;
	return request.post(
		`${root}/index.php?rest_route=/wc/v3/products/${productId}/variations`,
		options
	);
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/** Accept the bare wc/v3 record and the document/record/data envelopes used by store versions. */
function unwrapRecord(body: unknown): Record<string, unknown> | null {
	const root = asRecord(body);
	if (!root) return null;
	for (const key of ['document', 'record', 'data']) {
		const nested = asRecord(root[key]);
		if (nested) return nested;
	}
	return root;
}

function positiveId(record: Record<string, unknown> | null): number | null {
	const id = Number(record?.id ?? 0);
	return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Create one server-side product/customer that cannot already be resident in the restored POS
 * snapshot. A rejected or unreachable write is returned as an explicit skip reason; malformed
 * success responses remain failures because they violate the probe contract.
 */
export async function createSearchProbe(
	options: CreateSearchProbeOptions
): Promise<SearchProbeResult> {
	const {
		request,
		storeUrl,
		authorization,
		collection,
		workerIndex,
		writerConfigured = false,
	} = options;
	const token = mintSearchProbeToken(workerIndex);
	const data =
		collection === 'products'
			? {
					name: `E2E Probe ${token}`,
					type: 'simple',
					status: 'publish',
					regular_price: '1.00',
					manage_stock: false,
				}
			: {
					email: `${token}@example.invalid`,
					first_name: `E2E ${token}`,
					last_name: 'Probe',
				};

	try {
		const response = await probeRequest(request, 'post', storeUrl, collection, undefined, {
			...storeRequestOptions(authorization),
			data,
		});
		if (!response.ok()) {
			if (collection === 'products') {
				const reason = `Store rejected products search-probe creation (HTTP ${response.status()})`;
				if (productProbeFailureAction({ writerConfigured, status: response.status() }) === 'fail') {
					throw new Error(reason);
				}
				return { ok: false, reason: `${reason}; product-writer credentials are required` };
			}
			return {
				ok: false,
				reason: `Store rejected ${collection} search-probe creation (HTTP ${response.status()}); server write access is required`,
			};
		}

		const record = unwrapRecord(await response.json().catch(() => null));
		const id = positiveId(record);
		if (!record || id === null) {
			throw new Error(`${collection} search-probe create succeeded without a record id`);
		}
		const slug = typeof record.slug === 'string' && record.slug ? record.slug : null;
		if (collection === 'products' && !slug) {
			await deleteSearchProbe({ request, storeUrl, authorization, collection, id });
			throw new Error('products search-probe create succeeded without its WC response slug');
		}

		return {
			ok: true,
			probe: {
				collection,
				id,
				...(slug ? { rowTestId: `data-table-row-${slug}` } : {}),
				token,
			},
		};
	} catch (error) {
		if (collection === 'products' && writerConfigured) {
			throw error instanceof Error
				? error
				: new Error('Configured product-writer product creation failed');
		}
		if (error instanceof Error && error.message.includes('create succeeded')) throw error;
		return {
			ok: false,
			reason: `Store could not create the ${collection} search probe; server write access is required`,
		};
	}
}

/** Create a worker-private purchasable product; declared writer failures always throw. */
export async function createRunPrivateProduct(
	options: Omit<CreateSearchProbeOptions, 'authorization' | 'collection' | 'writerConfigured'> & {
		authorization: StoreAuthorization;
		kind: RunPrivateProductKind;
	}
): Promise<RunPrivateProductProbe> {
	const { request, storeUrl, authorization, kind, workerIndex } = options;
	if (kind === 'simple') {
		const created = await createSearchProbe({
			request,
			storeUrl,
			authorization,
			collection: 'products',
			workerIndex,
			writerConfigured: true,
		});
		if (!created.ok) throw new Error(created.reason);
		return created.probe;
	}

	const token = mintSearchProbeToken(workerIndex);
	const attributeName = `Choice ${token.slice(-6)}`;
	const parentResponse = await probeRequest(request, 'post', storeUrl, 'products', undefined, {
		...storeRequestOptions(authorization),
		data: {
			name: `E2E Variable ${token}`,
			type: 'variable',
			status: 'publish',
			manage_stock: false,
			attributes: [
				{
					name: attributeName,
					position: 0,
					visible: true,
					variation: true,
					options: ['Red', 'Blue'],
				},
			],
		},
	});
	if (!parentResponse.ok()) {
		throw new Error(
			`Store rejected variable product probe creation (HTTP ${parentResponse.status()})`
		);
	}

	const parent = unwrapRecord(await parentResponse.json().catch(() => null));
	const id = positiveId(parent);
	const slug = typeof parent?.slug === 'string' && parent.slug ? parent.slug : null;
	if (id === null || !slug) {
		throw new Error('Variable product probe create succeeded without its id and slug');
	}

	try {
		for (const [option, suffix] of [
			['Red', 'red'],
			['Blue', 'blue'],
			['', 'any'],
		] as const) {
			const response = await variationCreateRequest(request, storeUrl, authorization, id, {
				sku: `${token}${suffix}`,
				regular_price: '1.00',
				status: 'publish',
				manage_stock: false,
				attributes: [{ name: attributeName, option }],
			});
			if (!response.ok()) {
				throw new Error(`Store rejected variation probe creation (HTTP ${response.status()})`);
			}
			const variation = unwrapRecord(await response.json().catch(() => null));
			if (positiveId(variation) === null) {
				throw new Error('Variation probe create succeeded without its id');
			}
		}
	} catch (error) {
		await deleteSearchProbe({ request, storeUrl, authorization, collection: 'products', id });
		throw error;
	}

	return {
		collection: 'products',
		id,
		rowTestId: `data-table-row-${slug}`,
		token,
		variationSku: `${token}red`,
	};
}

/** Force-delete a probe without ever turning teardown trouble into a test failure. */
export async function deleteSearchProbe(
	options: Omit<CreateSearchProbeOptions, 'workerIndex'> & { id: number }
): Promise<void> {
	const { request, storeUrl, authorization, collection, id } = options;
	try {
		const response = await probeRequest(request, 'delete', storeUrl, collection, id, {
			...storeRequestOptions(authorization),
			params: { ...storeRequestOptions(authorization).params, force: 'true' },
		});
		if (!response.ok()) {
			log.warn(`[search-probe] failed to delete ${collection} ${id}: HTTP ${response.status()}`);
		}
	} catch {
		// Do not print the request error: query-auth stores can include the JWT in its URL.
		log.warn(`[search-probe] delete ${collection} ${id} threw`);
	}
}

/** Fill a testID-located search input only after arming the matching server-demand waiter. */
export async function searchAndWaitForServer(
	page: Page,
	searchInput: Locator,
	collection: SearchCollection,
	term: string
): Promise<void> {
	const responsePending = page.waitForResponse(
		(response) => {
			if (response.request().method() !== 'GET') return false;
			const url = new URL(response.url());
			const route = url.searchParams.get('rest_route');
			const matchesCollection =
				url.pathname.endsWith(`/wp-json/wcpos/v2/${collection}`) ||
				route === `/wcpos/v2/${collection}`;
			return matchesCollection && url.searchParams.get('search') === term;
		},
		{ timeout: 60_000 }
	);
	responsePending.catch(() => {});

	await searchInput.fill(term);
	const response = await responsePending;
	if (!response.ok()) {
		throw new Error(`${collection} search demand failed: HTTP ${response.status()}`);
	}
}
