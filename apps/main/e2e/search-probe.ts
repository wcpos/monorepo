import { randomUUID } from 'crypto';

import { log } from '@wcpos/utils/logger';

import { type StoreAuthorization, storeRequestOptions } from './fixtures';

import type { APIRequestContext, APIResponse, Locator, Page } from '@playwright/test';

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
	token?: string;
	/** True when CI declared product-writer secrets; failures must then fail, never skip. */
	writerConfigured?: boolean;
	/** Extra wc/v3 fields merged over the default product probe payload (products only). */
	productData?: Record<string, unknown>;
}

export function productWriterCredentialsDecision(
	user: string | undefined,
	pass: string | undefined
): boolean {
	if (user && !pass) {
		throw new Error(
			'E2E product-writer credentials are incomplete: E2E_PRODUCT_WRITER_PASS is missing'
		);
	}
	if (!user && pass) {
		throw new Error(
			'E2E product-writer credentials are incomplete: E2E_PRODUCT_WRITER_USER is missing'
		);
	}
	return Boolean(user && pass);
}

export function productWriterCredentialsConfigured(): boolean {
	return productWriterCredentialsDecision(
		process.env.E2E_PRODUCT_WRITER_USER,
		process.env.E2E_PRODUCT_WRITER_PASS
	);
}

export function productProbeFailureAction({
	writerConfigured,
	failure,
	retryAvailable,
}: {
	writerConfigured: boolean;
	failure: 'http' | 'transport';
	retryAvailable: boolean;
}): 'skip' | 'retry' | 'fail' {
	if (failure === 'transport' && retryAvailable) return 'retry';
	return writerConfigured ? 'fail' : 'skip';
}

function isNetworkishStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

class WriterAuthenticationFailure extends Error {
	constructor(
		readonly kind: 'http' | 'transport',
		readonly status: number | null
	) {
		super(kind);
	}
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
	productWriterCredentialsDecision(user, pass);
	if (!user || !pass) return null;

	// The server keys auth sessions by state + redirect URI, so concurrent workers need distinct states.
	const authUrl = `${storeUrl.replace(/\/+$/, '')}/wcpos-auth/?redirect_uri=https://localhost/cb&state=e2e-search-probe-${randomUUID()}`;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const pageResponse = await request.get(authUrl);
			if (isNetworkishStatus(pageResponse.status())) {
				throw new WriterAuthenticationFailure('transport', pageResponse.status());
			}
			if (!pageResponse.ok()) {
				throw new WriterAuthenticationFailure('http', pageResponse.status());
			}
			const html = await pageResponse.text();
			const nonce = /name="_wpnonce" value="([^"]+)"/.exec(html)?.[1];
			const session = /name="auth_session" value="([^"]+)"/.exec(html)?.[1];
			if (!nonce || !session) {
				throw new WriterAuthenticationFailure('http', pageResponse.status());
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
			if (isNetworkishStatus(submit.status())) {
				throw new WriterAuthenticationFailure('transport', submit.status());
			}
			const location = submit.headers()['location'] ?? '';
			const token = /access_token=([^&]+)/.exec(location)?.[1];
			if (!token) throw new WriterAuthenticationFailure('http', submit.status());
			return { transport: 'header', value: `Bearer ${token}` };
		} catch (error) {
			const failure =
				error instanceof WriterAuthenticationFailure
					? error
					: new WriterAuthenticationFailure('transport', null);
			const action = productProbeFailureAction({
				writerConfigured: true,
				failure: failure.kind,
				retryAvailable: attempt === 0,
			});
			// The login POST can transiently re-render the form as HTTP 200 with
			// valid credentials (observed on dev-next 2026-08-08; an immediate
			// identical login succeeds). One retry absorbs that flake; a genuine
			// credential failure still throws below, never skips.
			if (action === 'retry' || (failure.kind === 'http' && attempt === 0)) continue;
			const status = failure.status === null ? '' : ` (HTTP ${failure.status})`;
			if (failure.kind === 'transport') {
				log.warn('[search-probe] configured product-writer login transport failed');
				throw new Error(
					`Configured product-writer authentication transport failed after one retry${status}`
				);
			}
			log.warn('[search-probe] configured product-writer login was rejected');
			throw new Error(`Configured product-writer authentication failed${status}`);
		}
	}
	throw new Error('Configured product-writer authentication failed');
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
	method: 'get' | 'post' | 'delete',
	storeUrl: string,
	collection: ProbeCollection,
	id: number | undefined,
	options: ProbeRequestOptions
) {
	const pretty = await request[method](collectionUrl(storeUrl, collection, id), options);
	if (pretty.status() !== 404) return pretty;
	return request[method](plainPermalinkUrl(storeUrl, collection, id), options);
}

async function productCreateResponse(
	create: () => Promise<APIResponse>,
	writerConfigured: boolean,
	label: string,
	findExisting?: () => Promise<{ response: APIResponse; record: Record<string, unknown> | null }>
): Promise<{ response: APIResponse; adoptedRecord?: Record<string, unknown> }> {
	for (let attempt = 0; attempt < 2; attempt += 1) {
		let response: APIResponse;
		try {
			response = await create();
		} catch {
			const action = productProbeFailureAction({
				writerConfigured,
				failure: 'transport',
				retryAvailable: attempt === 0,
			});
			if (action === 'retry') {
				const existing = await findExisting?.();
				if (existing?.record) {
					return { response: existing.response, adoptedRecord: existing.record };
				}
				continue;
			}
			throw new Error(`${label} transport failed after one retry`);
		}
		if (response.ok()) return { response };
		const failure = isNetworkishStatus(response.status()) ? 'transport' : 'http';
		const action = productProbeFailureAction({
			writerConfigured,
			failure,
			retryAvailable: attempt === 0,
		});
		if (action === 'retry') {
			const existing = await findExisting?.();
			if (existing?.record) {
				return { response: existing.response, adoptedRecord: existing.record };
			}
			continue;
		}
		if (action === 'fail') {
			const transport = failure === 'transport' ? ' transport failed after one retry' : '';
			throw new Error(`${label}${transport} (HTTP ${response.status()})`);
		}
		return { response };
	}
	throw new Error(`${label} failed`);
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

async function findCreatedVariation(
	request: APIRequestContext,
	storeUrl: string,
	authorization: StoreAuthorization,
	productId: number,
	sku: string
): Promise<{ response: APIResponse; record: Record<string, unknown> | null }> {
	const root = storeUrl.replace(/\/+$/, '');
	const auth = storeRequestOptions(authorization);
	const options = { ...auth, params: { ...auth.params, sku } };
	let response = await request.get(
		`${root}/wp-json/wc/v3/products/${productId}/variations`,
		options
	);
	if (response.status() === 404) {
		response = await request.get(
			`${root}/index.php?rest_route=/wc/v3/products/${productId}/variations`,
			options
		);
	}
	if (!response.ok()) {
		throw new Error(`Variation create adoption lookup failed (HTTP ${response.status()})`);
	}
	const body: unknown = await response.json().catch(() => null);
	if (!Array.isArray(body)) {
		throw new Error('Variation create adoption lookup returned a malformed variation list');
	}
	return {
		response,
		record: body.map(asRecord).find((record) => record?.sku === sku) ?? null,
	};
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

export function findCreatedProductRecord(
	body: unknown,
	token: string,
	extraNames: readonly string[] = []
): Record<string, unknown> | null {
	if (!Array.isArray(body)) {
		throw new Error('Product create adoption lookup returned a malformed product list');
	}
	const expectedNames = new Set([`E2E Probe ${token}`, `E2E Variable ${token}`, ...extraNames]);
	return body.map(asRecord).find((record) => expectedNames.has(String(record?.name))) ?? null;
}

async function findCreatedProduct(
	request: APIRequestContext,
	storeUrl: string,
	authorization: StoreAuthorization | null,
	token: string,
	extraNames?: readonly string[]
): Promise<{ response: APIResponse; record: Record<string, unknown> | null }> {
	const auth = storeRequestOptions(authorization);
	const response = await probeRequest(request, 'get', storeUrl, 'products', undefined, {
		...auth,
		params: { ...auth.params, search: token, per_page: '100' },
	});
	if (!response.ok()) {
		throw new Error(`Product create adoption lookup failed (HTTP ${response.status()})`);
	}
	return {
		response,
		record: findCreatedProductRecord(await response.json().catch(() => null), token, extraNames),
	};
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
		token: suppliedToken,
		writerConfigured = false,
		productData,
	} = options;
	const token = suppliedToken ?? mintSearchProbeToken(workerIndex);
	// Custom names must start with "E2E Probe " so sweepOrphanedProductProbes can clean up orphans.
	const productName =
		typeof productData?.name === 'string' ? productData.name : `E2E Probe ${token}`;
	const data =
		collection === 'products'
			? {
					type: 'simple',
					status: 'publish',
					regular_price: '25.00',
					manage_stock: false,
					...productData,
					name: productName,
				}
			: {
					email: `${token}@example.invalid`,
					first_name: `E2E ${token}`,
					last_name: 'Probe',
				};

	try {
		const create = () =>
			probeRequest(request, 'post', storeUrl, collection, undefined, {
				...storeRequestOptions(authorization),
				data,
			});
		const result =
			collection === 'products'
				? await productCreateResponse(
						create,
						writerConfigured,
						'products search-probe creation',
						() => findCreatedProduct(request, storeUrl, authorization, token, [productName])
					)
				: { response: await create(), adoptedRecord: undefined };
		const { response } = result;
		if (!response.ok()) {
			if (collection === 'products') {
				const reason = `Store rejected products search-probe creation (HTTP ${response.status()})`;
				return { ok: false, reason: `${reason}; product-writer credentials are required` };
			}
			return {
				ok: false,
				reason: `Store rejected ${collection} search-probe creation (HTTP ${response.status()}); server write access is required`,
			};
		}

		const record = result.adoptedRecord ?? unwrapRecord(await response.json().catch(() => null));
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
	const parentResult = await productCreateResponse(
		() =>
			probeRequest(request, 'post', storeUrl, 'products', undefined, {
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
			}),
		true,
		'Variable product probe creation',
		() => findCreatedProduct(request, storeUrl, authorization, token)
	);

	const parent =
		parentResult.adoptedRecord ??
		unwrapRecord(await parentResult.response.json().catch(() => null));
	const id = positiveId(parent);
	const slug = typeof parent?.slug === 'string' && parent.slug ? parent.slug : null;
	if (id === null || !slug) {
		if (id !== null) {
			await deleteSearchProbe({ request, storeUrl, authorization, collection: 'products', id });
		}
		throw new Error('Variable product probe create succeeded without its id and slug');
	}

	try {
		// A wildcard sibling matches every selection, so count===1 popover resolution
		// and wildcard coverage are mutually exclusive on one shared product.
		for (const [option, suffix] of [
			['Red', 'red'],
			['Blue', 'blue'],
		] as const) {
			const sku = `${token}${suffix}`;
			const result = await productCreateResponse(
				() =>
					variationCreateRequest(request, storeUrl, authorization, id, {
						sku,
						regular_price: '25.00',
						status: 'publish',
						manage_stock: false,
						attributes: [{ name: attributeName, option }],
					}),
				true,
				'Variation probe creation',
				() => findCreatedVariation(request, storeUrl, authorization, id, sku)
			);
			const variation =
				result.adoptedRecord ?? unwrapRecord(await result.response.json().catch(() => null));
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

/** Read one product back over wc/v3 (both permalink styles); throws on any non-2xx. */
export async function fetchProductRecord(
	request: APIRequestContext,
	storeUrl: string,
	authorization: StoreAuthorization | null,
	id: number
): Promise<Record<string, unknown>> {
	const response = await probeRequest(
		request,
		'get',
		storeUrl,
		'products',
		id,
		storeRequestOptions(authorization)
	);
	if (!response.ok()) {
		throw new Error(`Product read-back failed (HTTP ${response.status()})`);
	}
	const record = unwrapRecord(await response.json().catch(() => null));
	if (!record) {
		throw new Error('Product read-back returned a malformed record');
	}
	return record;
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

/** Best-effort cleanup for probes left behind when a prior worker was interrupted. */
export async function sweepOrphanedProductProbes(
	options: Pick<CreateSearchProbeOptions, 'request' | 'storeUrl' | 'authorization'>
): Promise<void> {
	const { request, storeUrl, authorization } = options;
	try {
		const auth = storeRequestOptions(authorization);
		const response = await probeRequest(request, 'get', storeUrl, 'products', undefined, {
			...auth,
			params: { ...auth.params, search: 'E2E ', per_page: '100' },
		});
		if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
		const body: unknown = await response.json();
		if (!Array.isArray(body)) throw new Error('response was not a product list');
		const cutoff = Date.now() - 2 * 60 * 60 * 1_000;
		for (const value of body) {
			const product = asRecord(value);
			const name = typeof product?.name === 'string' ? product.name : '';
			const createdGmt =
				typeof product?.date_created_gmt === 'string' ? product.date_created_gmt : '';
			const id = positiveId(product);
			if (
				id !== null &&
				(name.startsWith('E2E Probe ') || name.startsWith('E2E Variable ')) &&
				Date.parse(`${createdGmt}Z`) < cutoff
			) {
				await deleteSearchProbe({ request, storeUrl, authorization, collection: 'products', id });
			}
		}
	} catch {
		log.warn('[search-probe] orphan product sweep failed');
	}
}

/** Fill a testID-located search input after arming its server and exact-local-result waiters. */
export async function searchAndWaitForServer(
	page: Page,
	searchInput: Locator,
	collection: SearchCollection,
	term: string,
	localResult?: Locator
): Promise<void> {
	const responsePending = page.waitForResponse(
		(response) => {
			if (response.request().method() !== 'GET') return false;
			const url = new URL(response.url());
			const route = url.searchParams.get('rest_route');
			const matchesDemand =
				url.pathname.endsWith(`/wp-json/wcpos/v2/${collection}`) ||
				route === `/wcpos/v2/${collection}` ||
				(collection === 'products' &&
					(url.pathname.endsWith('/wp-json/wcpos/v2/variations') ||
						route === '/wcpos/v2/variations'));
			return matchesDemand && url.searchParams.get('search') === term;
		},
		// 120s, not 60s: calibrated to the slowest gated store, not the fastest.
		// Under 4 concurrent shards the realism-profile store (dev-pro: WC 10.9,
		// ATUM hooking every product query, full plugin roster) answers search
		// with a p99 just past 60s — observed 2026-08-17, three retries at
		// exactly 1.1m each while idle latency measured 0.4s. A real regression
		// still fails; a slow-but-correct answer no longer does.
		{ timeout: 120_000 }
	);
	const localResultPending = localResult?.waitFor({ state: 'visible', timeout: 120_000 });
	responsePending.catch(() => {});
	localResultPending?.catch(() => {});

	await searchInput.fill(term);
	const response = localResultPending
		? await Promise.race([responsePending, localResultPending.then(() => null)])
		: await responsePending;
	if (response === null) return;
	if (!response.ok()) {
		throw new Error(`${collection} search demand failed: HTTP ${response.status()}`);
	}
}
