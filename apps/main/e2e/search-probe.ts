import { randomUUID } from 'crypto';

import { log } from '@wcpos/utils/logger';

import { type StoreAuthorization, storeRequestOptions } from './probe-credential';

import type { APIRequestContext, APIResponse, Locator, Page } from '@playwright/test';

/** Collections createSearchProbe can create records in. */
type ProbeCollection = 'products' | 'customers';
/**
 * Collections the wc/v3 request/delete plumbing can address. Orders are deletable
 * (arrival probes clean up after themselves) but are never created through
 * createSearchProbe — see createOrderArrivalProbe for why an order probe is its
 * own, deliberately scope-free, creation path.
 */
type WcRestCollection = ProbeCollection | 'orders';
type SearchCollection = WcRestCollection;

export interface SearchProbe {
	collection: ProbeCollection;
	id: number;
	rowTestId?: string;
	token: string;
}

export type RunPrivateProductKind = 'simple' | 'variable';
export interface RunPrivateProductProbe extends SearchProbe {
	variationSku?: string;
	/**
	 * The attachment this probe's variations were given, borrowed from a product the store
	 * already has (see {@link findDonorImageAttachmentId}). `null` means the store owns no
	 * product imagery at all — the only honest reason an image assertion cannot run.
	 */
	imageAttachmentId?: number | null;
	/**
	 * Why no attachment could be looked up, when the reason was a FAILED read rather than an
	 * imageless store. Carried rather than thrown: a donor-image shortfall must fail the one
	 * test that asserts on an image, not take the other nine variation tests down with it.
	 */
	imageLookupFailure?: string | null;
	/** What the donor search actually covered, so a skip states its evidence rather than a guess. */
	imageLookupDetail?: string | null;
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
	/** Extra wc/v3 fields merged over the default customer probe payload (customers only). */
	customerData?: Record<string, unknown>;
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
 *
 * The minted JWT's transport is resolved per store: a hostile proxy tier can
 * strip the Authorization header from every request (wcpos-infra#72 Tier 3,
 * always-on at dev-free since 2026-08-21), silently degrading a header-carried
 * token to an anonymous 401 — so the helper verifies the header with one read
 * and falls back to the `?authorization=` param.
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
			return await resolveWriterTransport(request, storeUrl, token);
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

/**
 * Decide which transport actually delivers the writer JWT to wc/v3 — by
 * evidence, not assumption. Try the header first, then the `Bearer`-prefixed
 * query form required by older servers, then the bare query form that survives
 * WAF prefix rules on newer servers. Only then declare the credentials broken.
 */
async function resolveWriterTransport(
	request: APIRequestContext,
	storeUrl: string,
	token: string
): Promise<StoreAuthorization> {
	let lastFailure = new WriterAuthenticationFailure('http', null);
	const candidates: StoreAuthorization[] = [
		{ transport: 'header', value: `Bearer ${token}` },
		{ transport: 'query', value: `Bearer ${token}` },
		{ transport: 'query', value: token },
	];
	for (const candidate of candidates) {
		const options = storeRequestOptions(candidate);
		try {
			const response = await probeRequest(request, 'get', storeUrl, 'products', undefined, {
				...options,
				params: { ...options.params, per_page: '1' },
			});
			if (response.ok()) return candidate;
			lastFailure = new WriterAuthenticationFailure('http', response.status());
		} catch {
			lastFailure = new WriterAuthenticationFailure('transport', null);
		}
	}
	throw lastFailure;
}

function collectionUrl(storeUrl: string, collection: ProbeRoute, id?: number): string {
	// wc/v3 accepts the JWT via Authorization header or ?authorization= param
	// (param verified against wc/v3 on 2026-08-21); the transport is chosen by
	// resolveWriterTransport, or captured from the app's own traffic.
	const base = `${storeUrl.replace(/\/+$/, '')}/wp-json/wc/v3/${collection}`;
	return id === undefined ? base : `${base}/${id}`;
}

/** The plain-permalink spelling of the same route: /index.php?rest_route=/wc/v3/… */
export function plainPermalinkUrl(storeUrl: string, collection: ProbeRoute, id?: number): string {
	const route = id === undefined ? `/wc/v3/${collection}` : `/wc/v3/${collection}/${id}`;
	return `${storeUrl.replace(/\/+$/, '')}/index.php?rest_route=${route}`;
}

type ProbeRequestOptions = {
	headers: Record<string, string>;
	params: Record<string, string>;
	data?: unknown;
};

/**
 * Routes the probe plumbing can address. The writable collections plus the
 * read-only reference routes a spec needs to ask the store what it holds —
 * `products/categories` is how a store-agnostic spec discovers a category that
 * actually has products instead of hard-coding one (see the E2E store-agnostic
 * policy in CLAUDE.md).
 */
type ProbeRoute = WcRestCollection | 'products/categories';

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
	collection: ProbeRoute,
	id: number | undefined,
	options: ProbeRequestOptions
) {
	// A WAF method policy (wcpos-infra#72 Tier 4, always-on at dev-free) 403s
	// DELETE at the proxy before WordPress sees it; WP core treats a POST with
	// `?_method=DELETE` as the same request, so deletes travel that way.
	const send = (url: string) =>
		method === 'delete'
			? request.post(url, { ...options, params: { ...options.params, _method: 'DELETE' } })
			: request[method](url, options);
	const pretty = await send(collectionUrl(storeUrl, collection, id));
	if (pretty.status() !== 404) return pretty;
	return send(plainPermalinkUrl(storeUrl, collection, id));
}

/**
 * GET a wc/v3 route with the app's own captured credentials, tolerating either
 * permalink style. The read half of {@link probeRequest}, exported so specs can
 * ask the store what it contains before asserting on what the UI renders.
 */
export function probeGet(
	request: APIRequestContext,
	storeUrl: string,
	route: ProbeRoute,
	options: ProbeRequestOptions
): Promise<APIResponse> {
	return probeRequest(request, 'get', storeUrl, route, undefined, options);
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
		customerData,
	} = options;
	const token = suppliedToken ?? mintSearchProbeToken(workerIndex);
	// Custom names must use a prefix recognized by sweepOrphanedProductProbes.
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
					...customerData,
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

/**
 * The outcome of the donor-image lookup, kept as three states rather than two.
 *
 * `{ ok: true, attachmentId: null }` means the read SUCCEEDED and the store owns no product
 * imagery — the one environment shortfall an image assertion may skip on. `{ ok: false }` means
 * the read itself failed (transport, 401/403/500, non-list body). Collapsing the second into the
 * first is how an auth or server regression turns into a quietly skipped test on a store that
 * declared writer credentials — precisely what the E2E policy says must fail instead.
 */
type DonorImageLookup =
	| { ok: true; attachmentId: number; searched?: number; exhausted?: boolean }
	| { ok: true; attachmentId: null; searched: number; exhausted: boolean }
	| { ok: false; reason: string };

/**
 * How far the donor-image search will walk before giving up.
 *
 * Unbounded pagination would be its own bug on a scale-fixture store — 20k products is 200
 * round trips before a single spec runs. Bounded, the two outcomes stay distinguishable:
 * `exhausted: true` means the store genuinely owns no product imagery, `exhausted: false`
 * means we stopped looking, and the skip reason says which.
 */
const DONOR_IMAGE_PAGE_SIZE = 100;
const DONOR_IMAGE_MAX_PAGES = 5;

/**
 * An attachment id the store already owns, borrowed so a probe product can carry a real image.
 *
 * Sideloading a fresh image would mint a new attachment on every CI run and leave it behind
 * (probe PRODUCTS are disposable, media is not — nothing deletes it). Re-using an id costs one
 * read and adds nothing to the store.
 */
async function findDonorImageAttachmentId(
	request: APIRequestContext,
	storeUrl: string,
	authorization: StoreAuthorization
): Promise<DonorImageLookup> {
	const auth = storeRequestOptions(authorization);
	let searched = 0;

	for (let page = 1; page <= DONOR_IMAGE_MAX_PAGES; page += 1) {
		let response: APIResponse;
		try {
			response = await probeGet(request, storeUrl, 'products', {
				...auth,
				params: {
					...auth.params,
					per_page: String(DONOR_IMAGE_PAGE_SIZE),
					page: String(page),
					status: 'publish',
				},
			});
		} catch (error) {
			return { ok: false, reason: `donor-image products read threw: ${String(error)}` };
		}
		if (!response.ok()) {
			return {
				ok: false,
				reason: `donor-image products read returned ${response.status()} ${response.statusText()}`,
			};
		}
		const body = await response.json().catch(() => null);
		if (!Array.isArray(body)) {
			return { ok: false, reason: 'donor-image products read returned a non-list body' };
		}

		for (const record of body) {
			const id = (record as { images?: { id?: unknown }[] })?.images?.[0]?.id;
			if (typeof id === 'number' && id > 0) return { ok: true, attachmentId: id };
		}

		searched += body.length;
		// A short page is the end of the catalogue: there is nothing further to search.
		if (body.length < DONOR_IMAGE_PAGE_SIZE) {
			return { ok: true, attachmentId: null, searched, exhausted: true };
		}
	}

	return { ok: true, attachmentId: null, searched, exhausted: false };
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
	// Looked up BEFORE the create so parent and variations can carry it from birth — an image
	// added later would have to race the client's already-running sync of this product.
	const donorImage = await findDonorImageAttachmentId(request, storeUrl, authorization);
	const imageAttachmentId = donorImage.ok ? donorImage.attachmentId : null;
	const imageLookupFailure = donorImage.ok ? null : donorImage.reason;
	const imageLookupDetail =
		donorImage.ok && donorImage.attachmentId === null
			? `searched ${donorImage.searched} published products, ${donorImage.exhausted ? 'the whole catalogue' : `the first ${DONOR_IMAGE_PAGE_SIZE * DONOR_IMAGE_MAX_PAGES}`}`
			: null;
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
					...(imageAttachmentId === null ? {} : { images: [{ id: imageAttachmentId }] }),
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
						// Explicit, not inherited: the variation carries its OWN image so the
						// rendered thumbnail is evidence about the variation document, never
						// about WooCommerce's parent fallback.
						...(imageAttachmentId === null ? {} : { image: { id: imageAttachmentId } }),
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
		imageAttachmentId,
		imageLookupFailure,
		imageLookupDetail,
	};
}

/**
 * One cell of the variation matrix below. `option`s are stable literals so a spec can address a
 * button by `variation-option-<option>` without selecting on localized text.
 */
interface MatrixCell {
	colour: 'Red' | 'Blue';
	size: 'Small' | 'Large';
	stock: { stock_quantity: number; backorders: 'no' | 'notify' };
}

/**
 * The matrix a popover spec needs. Two attributes, one deliberately missing combination, and
 * three variations that land on three different stock statuses:
 *
 *              Small                       Large
 *   Red        7 in stock                  0, no backorders  -> outofstock
 *   Blue       0, backorders notify        (does not exist)
 *              -> onbackorder
 *
 * Both of the popover's greying rules need this shape, and neither is reachable on the shared
 * single-attribute probe:
 *
 * - AVAILABILITY (`optionCounts[option] === 0`): only a missing combination produces it, and a
 *   product with one attribute has no combinations to miss. Selecting `Blue` must grey `Large`.
 * - STOCK (`disabledOptions[option]`): needs an option whose every variation sits outside the
 *   Stock Status filter while a sibling option stays inside it. Under an `instock` pill that is
 *   `Blue` — backordered, therefore sellable but not in stock, the exact gap that split the
 *   popover from the expanded table in #1574.
 *
 * The parent keeps an in-stock child (Red/Small), so WooCommerce leaves the parent `instock` and
 * the products list still shows it under an `instock` pill — without that the popover could not
 * be opened to observe any of this.
 */
export interface VariationMatrixProbe extends SearchProbe {
	/** Woo id keyed `${colour}/${size}`, e.g. `Red/Small`. */
	variationIds: Record<string, number>;
	colourAttribute: string;
	sizeAttribute: string;
}

export async function createVariationMatrixProduct(options: {
	request: APIRequestContext;
	storeUrl: string;
	authorization: StoreAuthorization;
	workerIndex: number;
}): Promise<VariationMatrixProbe> {
	const { request, storeUrl, authorization, workerIndex } = options;
	const token = mintSearchProbeToken(workerIndex);
	const suffix = token.slice(-6);
	const colourAttribute = `Colour ${suffix}`;
	const sizeAttribute = `Size ${suffix}`;

	const parentResult = await productCreateResponse(
		() =>
			probeRequest(request, 'post', storeUrl, 'products', undefined, {
				...storeRequestOptions(authorization),
				data: {
					name: `E2E Matrix ${token}`,
					type: 'variable',
					status: 'publish',
					manage_stock: false,
					attributes: [
						{
							name: colourAttribute,
							position: 0,
							visible: true,
							variation: true,
							options: ['Red', 'Blue'],
						},
						{
							name: sizeAttribute,
							position: 1,
							visible: true,
							variation: true,
							options: ['Small', 'Large'],
						},
					],
				},
			}),
		true,
		'Variation matrix parent creation',
		/**
		 * `findCreatedProductRecord` matches an ALLOWLIST of exact names, and this parent is not
		 * one of the two built-in ones. Without naming it here, a first POST that persists but
		 * loses its response adopts nothing, the retry creates a SECOND parent, and teardown
		 * deletes only the id it was handed — stranding the other on the dev store.
		 */
		() => findCreatedProduct(request, storeUrl, authorization, token, [`E2E Matrix ${token}`])
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
		throw new Error('Variation matrix parent create succeeded without its id and slug');
	}

	const cells: MatrixCell[] = [
		{ colour: 'Red', size: 'Small', stock: { stock_quantity: 7, backorders: 'no' } },
		{ colour: 'Red', size: 'Large', stock: { stock_quantity: 0, backorders: 'no' } },
		{ colour: 'Blue', size: 'Small', stock: { stock_quantity: 0, backorders: 'notify' } },
		// Blue/Large is intentionally absent — it is the hole the availability rule needs.
	];

	const variationIds: Record<string, number> = {};
	try {
		for (const cell of cells) {
			const sku = `${token}${cell.colour}${cell.size}`.toLowerCase();
			const result = await productCreateResponse(
				() =>
					variationCreateRequest(request, storeUrl, authorization, id, {
						sku,
						regular_price: '25.00',
						status: 'publish',
						manage_stock: true,
						...cell.stock,
						attributes: [
							{ name: colourAttribute, option: cell.colour },
							{ name: sizeAttribute, option: cell.size },
						],
					}),
				true,
				'Variation matrix cell creation',
				() => findCreatedVariation(request, storeUrl, authorization, id, sku)
			);
			const variation =
				result.adoptedRecord ?? unwrapRecord(await result.response.json().catch(() => null));
			const variationId = positiveId(variation);
			if (variationId === null) {
				throw new Error(`Variation matrix cell ${cell.colour}/${cell.size} created without an id`);
			}
			variationIds[`${cell.colour}/${cell.size}`] = variationId;
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
		variationIds,
		colourAttribute,
		sizeAttribute,
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

export type OrderArrivalProbeResult =
	{ ok: true; id: number; number: string } | { ok: false; reason: string };

/**
 * Create an order the way a WEB order reaches the store — a bare wc/v3 POST with no
 * POS scope meta and no cashier attribution. This is deliberately the opposite of
 * the "orders are created through the POS UI" policy: the directional arrival spec
 * exists to prove a record created OUTSIDE the POS reaches the till, so the probe
 * must not carry the scope the POS would stamp. An empty, zero-total order is
 * enough — arrival is about the record existing, not its contents — and it keeps
 * the probe out of every revenue-shaped report.
 */
export async function createOrderArrivalProbe(options: {
	request: APIRequestContext;
	storeUrl: string;
	authorization: StoreAuthorization | null;
	token: string;
	/** True when elevated writer credentials were used; failures must then fail, never skip. */
	writerConfigured: boolean;
}): Promise<OrderArrivalProbeResult> {
	const { request, storeUrl, authorization, token, writerConfigured } = options;
	const failure = `Store rejected orders arrival-probe creation`;
	try {
		const response = await probeRequest(request, 'post', storeUrl, 'orders', undefined, {
			...storeRequestOptions(authorization),
			data: {
				// 'processing' is what a paid web order lands as — squarely inside the
				// maintenance open-recent window, so suppression (the #1302 class) is
				// exactly what this probe would collide with if the class regressed.
				status: 'processing',
				billing: { first_name: 'E2E Arrival', last_name: token },
			},
		});
		if (!response.ok()) {
			const reason = `${failure} (HTTP ${response.status()}); server write access is required`;
			if (writerConfigured) throw new Error(reason);
			return { ok: false, reason };
		}
		const record = unwrapRecord(await response.json().catch(() => null));
		const id = positiveId(record);
		if (!record || id === null) {
			throw new Error('orders arrival-probe create succeeded without a record id');
		}
		// Sequential-order-number plugins make `number` differ from `id`; the grid
		// renders `number`, so that is the value the arrival assertion must use.
		const rawNumber = record.number;
		const number =
			typeof rawNumber === 'string' && rawNumber
				? rawNumber
				: typeof rawNumber === 'number'
					? String(rawNumber)
					: String(id);
		return { ok: true, id, number };
	} catch (error) {
		if (
			writerConfigured ||
			(error instanceof Error && error.message.includes('create succeeded'))
		) {
			throw error instanceof Error ? error : new Error(`${failure}: transport error`);
		}
		return {
			ok: false,
			reason: 'Store could not create the orders arrival probe; server write access is required',
		};
	}
}

/** Force-delete a probe without ever turning teardown trouble into a test failure. */
export async function deleteSearchProbe(options: {
	request: APIRequestContext;
	storeUrl: string;
	authorization: StoreAuthorization | null;
	collection: WcRestCollection;
	id: number;
}): Promise<void> {
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
				(name.startsWith('E2E Probe ') ||
					name.startsWith('E2E Variable ') ||
					name.startsWith('E2E Matrix ') ||
					// Arrival probes lead with a sort-direction token (see
					// ARRIVAL_PROBE_LEAD in server-created-visibility.spec.ts). `aaaa`
					// is retired but still swept, so orphans from older runs are not
					// stranded on the dev store.
					name.startsWith('0000 E2E Arrival ') ||
					name.startsWith('aaaa E2E Arrival ') ||
					name.startsWith('zzzz E2E Arrival ')) &&
				Date.parse(`${createdGmt}Z`) < cutoff
			) {
				await deleteSearchProbe({ request, storeUrl, authorization, collection: 'products', id });
			}
		}
	} catch {
		log.warn('[search-probe] orphan product sweep failed');
	}
}

/**
 * Fill a testID-located search input after arming its server and exact-local-result waiters.
 *
 * The server waiter requires a SUCCESSFUL demand, not merely the first matching response.
 * A search that 401s and then succeeds is the app recovering, and recovery is correct
 * behaviour: the access token lives 30 minutes, so a session evicted or expired mid-run
 * makes the app take one 401, refresh, and retry — and asserting on the first matching
 * response turns that recovery into `<collection> search demand failed: HTTP 401`. That is
 * what reddened 24/12/16 tests per shard on every PR on 2026-08-30, on stores whose
 * app-driven specs were otherwise passing. (product-category-filter.spec.ts already waits
 * this way, for the hostile-proxy flavour of the same recovery.)
 *
 * Nothing is weakened: a demand that NEVER succeeds inside the budget still fails, and the
 * failure names the last status the store actually gave rather than a bare timeout — and
 * an exact `localResult` may only stand in for the demand while the wire stayed QUIET. A
 * demand that went out and 401'd is not excused by a row that happened to render.
 *
 * That last rule is why this is not a `Promise.all` of the two waiters. `localResult`
 * exists precisely because the sync engine's demand coverage means an already-satisfied
 * search fires NO wire request at all: requiring both would hang the full 120 s every time
 * (observed on CI shard 4, 2026-08-21 — see `addCheckoutProbeProductAgain` in
 * checkout-probe.ts). Checking `lastFailure` on the local win keeps the invariant without
 * reintroducing that hang.
 */
export async function searchAndWaitForServer(
	page: Page,
	searchInput: Locator,
	collection: SearchCollection,
	term: string,
	localResult?: Locator
): Promise<void> {
	// The last non-OK matching demand, kept so a budget that runs out can say WHY.
	// A holder, not a `let`: the assignment happens inside the predicate closure, and
	// TypeScript's flow analysis would otherwise still read the variable as `null`.
	const lastFailure: { status: number | null } = { status: null };
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
			if (!matchesDemand || url.searchParams.get('search') !== term) return false;
			if (response.ok()) return true;
			lastFailure.status = response.status();
			return false;
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
	let satisfiedLocally = false;
	try {
		if (localResultPending) {
			satisfiedLocally = await Promise.race([
				responsePending.then(() => false),
				localResultPending.then(() => true),
			]);
		} else {
			await responsePending;
		}
	} catch (error) {
		if (lastFailure.status !== null) {
			throw new Error(`${collection} search demand failed: HTTP ${lastFailure.status}`);
		}
		throw error;
	}
	if (satisfiedLocally && lastFailure.status !== null) {
		throw new Error(`${collection} search demand failed: HTTP ${lastFailure.status}`);
	}
}
