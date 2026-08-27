#!/usr/bin/env node
/**
 * Native E2E seed/reset (fixtures decision, wayfinder #692).
 *
 * Runs before each native suite against the standing public test store
 * (dev-pro.wcpos.com). Scope: verify the store is reachable, ensure the simple
 * product the flows search for exists and is in stock, and ensure the
 * suite-owned variable product (flow 07) exists with sellable variations.
 * Fuller reset (pruning accumulated E2E orders/customers) extends here later.
 *
 * Env: E2E_STORE_URL (default https://dev-pro.wcpos.com)
 *      E2E_WC_CONSUMER_KEY / E2E_WC_CONSUMER_SECRET (WooCommerce REST,
 *        read/write; plain WC_CONSUMER_KEY / WC_CONSUMER_SECRET also accepted)
 *      E2E_PRODUCT_SEARCH (default "Beanie")
 */
const STORE_URL = (process.env.E2E_STORE_URL ?? 'https://dev-pro.wcpos.com').replace(/\/$/, '');
const PRODUCT = process.env.E2E_PRODUCT_SEARCH ?? 'Beanie';
const KEY = process.env.E2E_WC_CONSUMER_KEY ?? process.env.WC_CONSUMER_KEY;
const SECRET = process.env.E2E_WC_CONSUMER_SECRET ?? process.env.WC_CONSUMER_SECRET;

// This script sends write-capable credentials to STORE_URL — never over plain
// HTTP, and never to a host outside the standing E2E stores.
const ALLOWED_WRITE_HOSTS = ['dev-pro.wcpos.com', 'dev-free.wcpos.com'];
const storeHost = new URL(STORE_URL).hostname;
if (!STORE_URL.startsWith('https://')) {
	console.error(`✖ E2E_STORE_URL must use https:// (got: ${STORE_URL})`);
	process.exit(1);
}
if (KEY && SECRET && !ALLOWED_WRITE_HOSTS.includes(storeHost)) {
	console.error(
		`✖ Refusing authenticated writes to ${storeHost} — allowed hosts: ${ALLOWED_WRITE_HOSTS.join(', ')}`
	);
	process.exit(1);
}

const api = (route, init = {}) => {
	const url = new URL(`${STORE_URL}/wp-json/wc/v3/${route}`);
	url.searchParams.set('consumer_key', KEY);
	url.searchParams.set('consumer_secret', SECRET);
	return fetch(url, {
		...init,
		headers: { 'content-type': 'application/json', ...init.headers },
	});
};

// Reachability first — fail loudly and early either way.
const head = await fetch(`${STORE_URL}/wp-json`, { method: 'GET' });
if (!head.ok) {
	console.error(`✖ Store unreachable: ${STORE_URL} → HTTP ${head.status}`);
	process.exit(1);
}
console.log(`✔ Store reachable: ${STORE_URL}`);

if (!KEY || !SECRET) {
	console.warn(
		'⚠ E2E_WC_CONSUMER_KEY/SECRET not set — skipping seed assertions (reachability only).'
	);
	process.exit(0);
}

const res = await api(`products?search=${encodeURIComponent(PRODUCT)}&per_page=20`);
if (!res.ok) {
	console.error(`✖ WC REST error listing products: HTTP ${res.status}`);
	process.exit(1);
}
// The WC search is fuzzy — only the exact-name product is the seed target, so
// a partial match ("Beanie with Logo") is never mutated on the shared store.
const products = (await res.json()).filter((p) => p.name.toLowerCase() === PRODUCT.toLowerCase());
if (!products.length) {
	console.error(`✖ No product named exactly "${PRODUCT}" on ${STORE_URL} — flows will fail.`);
	process.exit(1);
}
// The flows tap `product-tile`, which only renders for SIMPLE products
// (variable products get `variable-product-tile`).
const nonSimple = products.filter((p) => p.type !== 'simple');
if (nonSimple.length === products.length) {
	console.error(
		`✖ "${PRODUCT}" exists but no simple-type variant — flows tap product-tile and will fail.`
	);
	process.exit(1);
}
for (const p of products) {
	if (p.stock_status !== 'instock') {
		const fix = await api(`products/${p.id}`, {
			method: 'PUT',
			body: JSON.stringify({ stock_status: 'instock' }),
		});
		if (!fix.ok) {
			console.error(`✖ Failed to restock "${p.name}" (#${p.id}): HTTP ${fix.status}`);
			process.exit(1);
		}
		console.log(`  restocked "${p.name}" (#${p.id})`);
	}
}
console.log(`✔ Seed product "${PRODUCT}" present and in stock.`);

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
