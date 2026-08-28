#!/usr/bin/env node
/**
 * Native E2E seed/reset (fixtures decision, wayfinder #692).
 *
 * Runs before each native suite against the standing public test store
 * (dev-pro.wcpos.com). Scope: verify the store is reachable, and ensure the
 * two suite-OWNED products exist and are sellable — the simple product flows
 * 04/06 sell, and the variable product flow 07 opens (created when missing,
 * repaired when drifted; store-agnostic policy).
 * Fuller reset (pruning accumulated E2E orders/customers) extends here later.
 *
 * Env: E2E_STORE_URL (default https://dev-pro.wcpos.com)
 *      E2E_PRODUCT_WRITER_USER / E2E_PRODUCT_WRITER_PASS (the standing
 *        shop_manager identity every dev store carries — the same secrets the
 *        web E2E's search-probe uses; a JWT is minted through /wcpos-auth/)
 */
import { randomUUID } from 'node:crypto';

const STORE_URL = (process.env.E2E_STORE_URL ?? 'https://dev-pro.wcpos.com').replace(/\/$/, '');
const WRITER_USER = process.env.E2E_PRODUCT_WRITER_USER;
const WRITER_PASS = process.env.E2E_PRODUCT_WRITER_PASS;

// This script sends write-capable credentials to STORE_URL — never over plain
// HTTP, and never to a host outside the standing E2E stores.
const ALLOWED_WRITE_HOSTS = ['dev-pro.wcpos.com', 'dev-free.wcpos.com', 'dev-next.wcpos.com'];
const storeHost = new URL(STORE_URL).hostname;
if (!STORE_URL.startsWith('https://')) {
	console.error(`✖ E2E_STORE_URL must use https:// (got: ${STORE_URL})`);
	process.exit(1);
}
if (WRITER_USER && WRITER_PASS && !ALLOWED_WRITE_HOSTS.includes(storeHost)) {
	console.error(
		`✖ Refusing authenticated writes to ${storeHost} — allowed hosts: ${ALLOWED_WRITE_HOSTS.join(', ')}`
	);
	process.exit(1);
}

/**
 * Mint a writer JWT through the plugin's own /wcpos-auth/ login flow — the
 * same mechanism the web E2E's productWriterAuthorization uses (the
 * E2E_WC_CONSUMER_KEY/SECRET this script originally read were never
 * provisioned as secrets, so the consumer-key path was dead config).
 * Declared-but-broken credentials exit 1: a provisioning failure must never
 * disguise itself as a skip.
 */
async function mintWriterToken() {
	const authUrl = `${STORE_URL}/wcpos-auth/?redirect_uri=https://localhost/cb&state=e2e-native-seed-${randomUUID()}`;
	// The login POST can transiently re-render the form with valid credentials
	// (observed on dev-next 2026-08-08, noted in search-probe.ts) — one retry
	// absorbs that; a genuine rejection still fails below.
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const page = await fetch(authUrl);
		if (!page.ok) {
			console.error(`✖ /wcpos-auth/ login page failed: HTTP ${page.status}`);
			process.exit(1);
		}
		const html = await page.text();
		const nonce = /name="_wpnonce" value="([^"]+)"/.exec(html)?.[1];
		const session = /name="auth_session" value="([^"]+)"/.exec(html)?.[1];
		if (!nonce || !session) {
			console.error('✖ /wcpos-auth/ login page did not include _wpnonce/auth_session fields');
			process.exit(1);
		}
		const submit = await fetch(authUrl, {
			method: 'POST',
			redirect: 'manual',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				'wcpos-log': WRITER_USER,
				'wcpos-pwd': WRITER_PASS,
				_wpnonce: nonce,
				auth_session: session,
				'wcpos-submit': '1',
			}),
		});
		const location = submit.headers.get('location') ?? '';
		const token = /access_token=([^&]+)/.exec(location)?.[1];
		if (token) return token;
		if (attempt === 0) continue;
		// A 200 here is the login form re-rendered with the store's reason — bad
		// credentials, no POS permission, a failed security check, or the
		// plugin's own rate limit are four different problems behind one status
		// code (2026-08-28: a day was lost to "HTTP 200"). Say which.
		const body = await submit.text().catch(() => '');
		const reason =
			/color: #CD2C24[^>]*>\s*([^<]+)</.exec(body)?.[1]?.trim() ??
			/locked|too many|security check|permission|inv[aá]lid/i.exec(body)?.[0] ??
			'no error text in response';
		console.error(`✖ Product-writer authentication failed (HTTP ${submit.status}): ${reason}`);
		process.exit(1);
	}
}

// Reachability first — fail loudly and early either way.
const head = await fetch(`${STORE_URL}/wp-json`, { method: 'GET' });
if (!head.ok) {
	console.error(`✖ Store unreachable: ${STORE_URL} → HTTP ${head.status}`);
	process.exit(1);
}
console.log(`✔ Store reachable: ${STORE_URL}`);

if (!WRITER_USER && !WRITER_PASS) {
	console.warn(
		'⚠ E2E_PRODUCT_WRITER_USER/PASS not set — skipping seed assertions (reachability only).'
	);
	process.exit(0);
}
// Exactly one credential set is a provisioning failure, not a missing
// capability — fail the workflow rather than silently disabling the seed
// again (mirrors productWriterCredentialsDecision in search-probe.ts).
if (!WRITER_USER || !WRITER_PASS) {
	console.error(
		'✖ Product-writer credentials are incomplete — set E2E_PRODUCT_WRITER_USER and E2E_PRODUCT_WRITER_PASS together.'
	);
	process.exit(1);
}

const TOKEN = await mintWriterToken();
console.log('✔ Product-writer JWT minted via /wcpos-auth/.');

const authedFetch = (route, transport, init = {}) => {
	const url = new URL(`${STORE_URL}/wp-json/wc/v3/${route}`);
	const headers = { 'content-type': 'application/json', ...init.headers };
	if (transport.kind === 'header') headers.authorization = transport.value;
	else url.searchParams.set('authorization', transport.value);
	return fetch(url, { ...init, headers });
};

// Decide which transport actually delivers the JWT to wc/v3 — by evidence,
// not assumption (mirrors resolveWriterTransport in search-probe.ts). The
// allow-listed dev-free store's proxy strips the Authorization header
// outright, silently degrading a header-carried token to an anonymous 401,
// so probe header → Bearer query → bare query before declaring failure.
const TRANSPORT = await (async () => {
	const candidates = [
		{ kind: 'header', value: `Bearer ${TOKEN}` },
		{ kind: 'query', value: `Bearer ${TOKEN}` },
		{ kind: 'query', value: TOKEN },
	];
	let lastStatus = null;
	for (const candidate of candidates) {
		const probe = await authedFetch('products?per_page=1', candidate);
		if (probe.ok) return candidate;
		lastStatus = probe.status;
	}
	console.error(`✖ Minted writer JWT was rejected on every transport (last HTTP ${lastStatus})`);
	process.exit(1);
})();

const api = (route, init = {}) => authedFetch(route, TRANSPORT, init);

// Simple product for flows 04/06 (cash sale, cart quantity editing).
//
// The suite OWNS this product — created here when missing, repaired when
// drifted — so the flows never depend on a store's remembered catalogue
// (store-agnostic policy; the flows previously searched a hardcoded "Beanie"
// and the seed could only hard-fail when a store lacked it). Keep the
// constant in step with the flows' PRODUCT_SEARCH env defaults.
const SIMPLE_PRODUCT = 'WCPOS E2E Simple';

const sSearch = await api(`products?search=${encodeURIComponent(SIMPLE_PRODUCT)}&per_page=20`);
if (!sSearch.ok) {
	console.error(`✖ WC REST error searching for "${SIMPLE_PRODUCT}": HTTP ${sSearch.status}`);
	process.exit(1);
}
// Exact-name match only: the WC search is fuzzy, and only the suite-owned
// record is ever mutated on the shared store. Adopt only a PUBLISHED record:
// the POS product query and sync request status=publish, so adopting a
// draft/private leftover would suppress creation while the grid never shows
// it — flows then time out despite a "successful" seed (review, #1630).
let simpleProduct = (await sSearch.json()).find(
	(p) => p.name === SIMPLE_PRODUCT && p.type === 'simple' && p.status === 'publish'
);
if (!simpleProduct) {
	const create = await api('products', {
		method: 'POST',
		body: JSON.stringify({
			name: SIMPLE_PRODUCT,
			type: 'simple',
			status: 'publish',
			regular_price: '1.00',
			stock_status: 'instock',
			manage_stock: false,
		}),
	});
	if (!create.ok) {
		console.error(`✖ Failed to create "${SIMPLE_PRODUCT}": HTTP ${create.status}`);
		process.exit(1);
	}
	simpleProduct = await create.json();
	console.log(`  created simple product "${SIMPLE_PRODUCT}" (#${simpleProduct.id})`);
}
// Repair drift: the flows tap the tile and expect a sellable $1 line, so
// every field the sell path actually reads must be right (review, #1630):
// - managed stock ignores stock_status; a depleted quantity makes the tile
//   unaddable even when "instock" — the fixture never manages stock.
// - the POS sells the EFFECTIVE price: an active zero sale overrides a
//   healthy regular_price, so repair keys on `price` and clears the sale.
const repairs = {};
if (simpleProduct.stock_status !== 'instock') repairs.stock_status = 'instock';
if (simpleProduct.manage_stock) repairs.manage_stock = false;
if (!parseFloat(simpleProduct.regular_price)) repairs.regular_price = '1.00';
if (!parseFloat(simpleProduct.price) && simpleProduct.sale_price !== '') repairs.sale_price = '';
if (Object.keys(repairs).length) {
	const fix = await api(`products/${simpleProduct.id}`, {
		method: 'PUT',
		body: JSON.stringify(repairs),
	});
	if (!fix.ok) {
		console.error(
			`✖ Failed to repair "${SIMPLE_PRODUCT}" (#${simpleProduct.id}): HTTP ${fix.status}`
		);
		process.exit(1);
	}
	// The PUT's response is the post-repair document — assert the EFFECTIVE
	// sell path is healthy rather than trusting the writes landed (review,
	// #1630: "revalidate the effective price after repairing").
	simpleProduct = await fix.json();
	console.log(
		`  repaired "${SIMPLE_PRODUCT}" (#${simpleProduct.id}): ${Object.keys(repairs).join(', ')}`
	);
}
if (
	simpleProduct.stock_status !== 'instock' ||
	simpleProduct.manage_stock ||
	!parseFloat(simpleProduct.price)
) {
	console.error(
		`✖ "${SIMPLE_PRODUCT}" (#${simpleProduct.id}) is still not sellable after repair ` +
			`(status=${simpleProduct.stock_status}, managed=${simpleProduct.manage_stock}, price=${simpleProduct.price})`
	);
	process.exit(1);
}
console.log(`✔ Simple product "${SIMPLE_PRODUCT}" (#${simpleProduct.id}) present and sellable.`);

// ---------------------------------------------------------------------------
// Variable product for flow 07 (variation popover → add to cart).
//
// The suite OWNS this product: it is created here when missing, so the flow
// never depends on a store's remembered catalogue (store-agnostic policy).
// Keep the three constants in step with the flow's env block
// (apps/main/.maestro/flows/07-variation-add-to-cart.yml).
//
// The options are deliberately short: the popover renders tappable
// `variation-option-<option>` buttons only while the combined option text is
// short; longer text falls back to a Select whose item testIDs never reach
// the native accessibility tree, and the flow would go blind.
const VARIABLE_PRODUCT = 'WCPOS E2E Variable';
const VARIABLE_ATTRIBUTE = 'Size';
const VARIABLE_OPTIONS = ['Small', 'Large'];

// Case-insensitive matching is for FINDING drifted records only (so a "small"
// leftover is repaired, never duplicated). Equivalence for the app is EXACT:
// the popover's testIDs embed the raw option string and the POS matches
// attribute names/options with `===` (variation-matches.ts), so every repair
// below writes back the canonical casing.
const sameOption = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

const listVariations = async (productId) => {
	const r = await api(`products/${productId}/variations?per_page=100`);
	if (!r.ok) {
		console.error(`✖ WC REST error listing variations of #${productId}: HTTP ${r.status}`);
		process.exit(1);
	}
	return r.json();
};

const createVariation = async (productId, option) => {
	const r = await api(`products/${productId}/variations`, {
		method: 'POST',
		body: JSON.stringify({
			regular_price: '1.00',
			attributes: [{ name: VARIABLE_ATTRIBUTE, option }],
		}),
	});
	if (!r.ok) {
		console.error(`✖ Failed to create "${option}" variation on #${productId}: HTTP ${r.status}`);
		process.exit(1);
	}
	console.log(`  created variation "${option}" on "${VARIABLE_PRODUCT}" (#${productId})`);
};

const vSearch = await api(`products?search=${encodeURIComponent(VARIABLE_PRODUCT)}&per_page=20`);
if (!vSearch.ok) {
	console.error(`✖ WC REST error searching for "${VARIABLE_PRODUCT}": HTTP ${vSearch.status}`);
	process.exit(1);
}
let variableProduct = (await vSearch.json()).find(
	(p) => p.name === VARIABLE_PRODUCT && p.type === 'variable'
);

if (!variableProduct) {
	const created = await api('products', {
		method: 'POST',
		body: JSON.stringify({
			name: VARIABLE_PRODUCT,
			type: 'variable',
			status: 'publish',
			attributes: [
				{ name: VARIABLE_ATTRIBUTE, visible: true, variation: true, options: VARIABLE_OPTIONS },
			],
		}),
	});
	if (!created.ok) {
		console.error(`✖ Failed to create "${VARIABLE_PRODUCT}": HTTP ${created.status}`);
		process.exit(1);
	}
	variableProduct = await created.json();
	console.log(`  created variable product "${VARIABLE_PRODUCT}" (#${variableProduct.id})`);
} else {
	// A previous run may have been interrupted between parent and variations,
	// or the store may have drifted — repair the attribute definition unless
	// it carries the canonical name and every option with EXACT casing.
	const attr = (variableProduct.attributes ?? []).find(
		(a) => sameOption(a.name, VARIABLE_ATTRIBUTE) && a.variation
	);
	const attrExact =
		attr &&
		attr.name === VARIABLE_ATTRIBUTE &&
		VARIABLE_OPTIONS.every((o) => (attr.options ?? []).includes(o));
	if (!attrExact) {
		const fixed = await api(`products/${variableProduct.id}`, {
			method: 'PUT',
			body: JSON.stringify({
				attributes: [
					{ name: VARIABLE_ATTRIBUTE, visible: true, variation: true, options: VARIABLE_OPTIONS },
				],
			}),
		});
		if (!fixed.ok) {
			console.error(
				`✖ Failed to repair attributes on "${VARIABLE_PRODUCT}" (#${variableProduct.id}): HTTP ${fixed.status}`
			);
			process.exit(1);
		}
		console.log(`  repaired "${VARIABLE_ATTRIBUTE}" attribute on #${variableProduct.id}`);
	}
}

const variations = await listVariations(variableProduct.id);
for (const option of VARIABLE_OPTIONS) {
	const existing = variations.find((v) =>
		(v.attributes ?? []).some(
			(a) => sameOption(a.name, VARIABLE_ATTRIBUTE) && sameOption(a.option, option)
		)
	);
	if (!existing) {
		await createVariation(variableProduct.id, option);
		continue;
	}
	// The popover's Add to Cart is disabled for unsellable variations, and a
	// price-less variation is not purchasable — repair both. Casing drift is
	// repaired too (see sameOption above).
	const patch = {};
	const matchedAttr = existing.attributes.find(
		(a) => sameOption(a.name, VARIABLE_ATTRIBUTE) && sameOption(a.option, option)
	);
	if (matchedAttr.name !== VARIABLE_ATTRIBUTE || matchedAttr.option !== option) {
		patch.attributes = [{ name: VARIABLE_ATTRIBUTE, option }];
	}
	// Managed inventory ignores stock_status (the POS's resolveStock derives
	// sellability from quantity + backorders), and a real quantity would
	// decrement with every test order — unmanaged is the durable state for a
	// suite-owned fixture.
	if (existing.manage_stock === true) patch.manage_stock = false;
	if (existing.stock_status !== 'instock') patch.stock_status = 'instock';
	if (!existing.regular_price && !existing.price) patch.regular_price = '1.00';
	if (Object.keys(patch).length) {
		const fix = await api(`products/${variableProduct.id}/variations/${existing.id}`, {
			method: 'PUT',
			body: JSON.stringify(patch),
		});
		if (!fix.ok) {
			console.error(
				`✖ Failed to repair variation "${option}" (#${existing.id}): HTTP ${fix.status}`
			);
			process.exit(1);
		}
		console.log(`  repaired variation "${option}" (#${existing.id})`);
	}
}
console.log(
	`✔ Variable product "${VARIABLE_PRODUCT}" (#${variableProduct.id}) present with sellable variations.`
);

// Hand the product id to the Maestro flows (variation flow taps the
// id-bearing `variable-product-tile-<id>` testID, never "first result").
if (process.env.GITHUB_OUTPUT) {
	const { appendFileSync } = await import('node:fs');
	appendFileSync(process.env.GITHUB_OUTPUT, `variable_product_id=${variableProduct.id}\n`);
}
