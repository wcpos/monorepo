#!/usr/bin/env node
/**
 * Native E2E seed/reset (fixtures decision, wayfinder #692).
 *
 * Runs before each native suite against the standing public test store
 * (dev-pro.wcpos.com). v1 scope: verify the store is reachable and ensure the
 * product the flows search for exists and is in stock. Fuller reset (pruning
 * accumulated E2E orders/customers) extends here later.
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
