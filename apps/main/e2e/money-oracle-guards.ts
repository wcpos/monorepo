import { expect } from '@playwright/test';

/**
 * The money oracle's COVERAGE GUARDS, extracted so they can be unit-pinned.
 *
 * These answer "did this run actually exercise the thing it claims to?" — the
 * declared-coverage rule. They are not the money assertions; they are the
 * instruments that decide whether the money assertions were pointed at anything.
 *
 * WHY THEY LIVE HERE. On 2026-08-24 both guards shipped inside the spec, untested,
 * and BOTH were incapable of failing:
 *
 *  - `assertDiscriminating` compared `Number(t).toFixed(2) !== Number(t).toFixed(6)`
 *    — two strings of different WIDTH, so `"0.70" !== "0.700000"` was true for every
 *    value ever passed. It declared full coverage on carts whose taxes were all whole
 *    cents, which is exactly the arithmetic that cannot tell a correct rounding rule
 *    from a broken one.
 *  - `assertMixedTaxTreatment` required "more than one distinct rate set", which a
 *    taxed line beside an UNTAXED one satisfies without ever applying a second rate.
 *    It passed on dev-pro while the reduced-rate fixture rang up untaxed.
 *
 * The money rules those guards protect were each mutation-checked — broken on purpose,
 * watched fail, restored. The guards themselves got none of that. Same lesson as
 * `order-lifecycle.unit.spec.ts`: a helper is code, and an assertion that cannot return
 * false reads in the report exactly like one that can.
 *
 * Every guard here is a pure function of a server order document. No page, no store.
 */

export type GuardTaxLine = { id?: unknown; total?: unknown; subtotal?: unknown };
export type GuardLine = { taxes?: GuardTaxLine[] };
export type GuardOrder = Record<string, unknown>;

export function linesOf(payload: GuardOrder, key: string): GuardLine[] {
	const value = payload[key];
	return Array.isArray(value) ? (value as GuardLine[]) : [];
}

/**
 * Did this sale produce a per-rate tax that ROUNDING WOULD CHANGE?
 *
 * A per-rate tax landing exactly on the store's display precision is identical whether
 * the client stores it raw or rounds it, so a run made only of those cannot fail either
 * way. Counting such a run as proof is how the 2026-08-24 bugs survived 566 green unit
 * tests: every fee and shipping fixture used amounts like `10 @ 20% = 2`.
 *
 * Scoped to the line type UNDER TEST, never the whole order — an order-wide check is a
 * proxy for the claim and passes on the wrong evidence. If a fee silently lands at 0.00
 * its taxes are 0 on both sides and compare equal, while the probe PRODUCT's sub-cent
 * tax satisfies an order-wide check: a fee scenario green-lighting without a fee.
 */
export function assertDiscriminating(
	doc: GuardOrder,
	underTest: string,
	label: string,
	priceDecimals: number
): void {
	const perRate: string[] = [];
	for (const line of linesOf(doc, underTest)) {
		for (const tax of line.taxes ?? []) {
			const text = String(tax?.total ?? '').trim();
			if (text !== '') perRate.push(text);
		}
	}
	expect(
		perRate.length,
		`${label}: the sale recorded no per-rate taxes on ${underTest} at all`
	).toBeGreaterThan(0);

	// NUMERIC comparison. Comparing two toFixed() STRINGS of different width is true for
	// every input — the original defect this guard shipped with.
	const unrounded = perRate.filter(
		(text) => Number(Number(text).toFixed(priceDecimals)) !== Number(text)
	);
	expect(
		unrounded.length,
		`${label}: NOT COVERED — every per-rate tax on this sale's ${underTest} is a whole ` +
			`${priceDecimals}-decimal amount (${perRate.join(', ')}), so this run cannot ` +
			`distinguish rounded per-rate taxes from raw ones. Either the amount never reached ` +
			`the line (check the [money-oracle] log lines for a 0 total) or this store's rates ` +
			`divide it evenly. Do NOT read this run as proof.`
	).toBeGreaterThan(0);
}

/**
 * Did this cart genuinely mix tax treatments — two distinct NON-EMPTY rate sets, plus
 * an untaxed line?
 *
 * "More than one distinct signature" is not enough: a taxed line beside an untaxed one
 * satisfies it while never applying a second RATE. That is what dev-pro did on
 * 2026-08-24 — its reduced-rate rate was scoped GB, its POS outlets are US:AL, so the
 * reduced-rate fixture rang up untaxed and the assertion passed on the wrong evidence.
 */
export function assertMixedTaxTreatment(doc: GuardOrder, label: string): void {
	const signatures = linesOf(doc, 'line_items').map((line) =>
		(line.taxes ?? [])
			.map((tax) => String(tax?.id ?? ''))
			.sort()
			.join(',')
	);
	const rendered = signatures.map((sig) => `[${sig || 'untaxed'}]`).join(' ');

	const taxed = signatures.filter((sig) => sig !== '');
	expect(
		new Set(taxed).size,
		`${label}: NOT COVERED — this sale applied fewer than two distinct rate sets ` +
			`(${rendered}). A taxed line beside an untaxed one is not a class mix. Most likely ` +
			`the reduced-rate class has no rate for the tax location this till resolves — run ` +
			`e2e/scripts/tax-class-fixtures.php, which provisions rates per taxing country.`
	).toBeGreaterThan(1);

	expect(
		signatures.some((sig) => sig === ''),
		`${label}: no untaxed line on this sale (${rendered}); the tax_status=none path ` +
			`was not exercised.`
	).toBe(true);
}
