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
 *      WC_CONSUMER_KEY / WC_CONSUMER_SECRET (WooCommerce REST, read/write)
 *      E2E_PRODUCT_SEARCH (default "Beanie")
 */
const STORE_URL = (process.env.E2E_STORE_URL ?? 'https://dev-pro.wcpos.com').replace(/\/$/, '');
const PRODUCT = process.env.E2E_PRODUCT_SEARCH ?? 'Beanie';
const KEY = process.env.WC_CONSUMER_KEY;
const SECRET = process.env.WC_CONSUMER_SECRET;

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
	console.warn('⚠ WC_CONSUMER_KEY/SECRET not set — skipping seed assertions (reachability only).');
	process.exit(0);
}

const res = await api(`products?search=${encodeURIComponent(PRODUCT)}&per_page=5`);
if (!res.ok) {
	console.error(`✖ WC REST error listing products: HTTP ${res.status}`);
	process.exit(1);
}
const products = await res.json();
if (!products.length) {
	console.error(`✖ Seed product "${PRODUCT}" not found on ${STORE_URL} — flows will fail.`);
	process.exit(1);
}
for (const p of products) {
	if (p.stock_status !== 'instock') {
		const fix = await api(`products/${p.id}`, {
			method: 'PUT',
			body: JSON.stringify({ stock_status: 'instock' }),
		});
		console.log(`  restocked "${p.name}" (#${p.id}) → HTTP ${fix.status}`);
	}
}
console.log(`✔ Seed product "${PRODUCT}" present and in stock (${products.length} match(es)).`);
