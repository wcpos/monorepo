import oracle from '../contracts/write-contract/fixtures/order-money-oracle.json';

/**
 * THE shared money oracle (`contracts/write-contract/fixtures/order-money-oracle.json`),
 * typed for test use.
 *
 * It lives under `contracts/` rather than beside a test file on purpose: the
 * plugin's write-contract suite reads the same directory, so client and server
 * argue against ONE arithmetic instead of two hand-typed copies that drift.
 *
 * All three shapes are THE SAME MONEY. A comparator that calls any pair of them
 * divergent is over-strict; one that calls a real recalculation equal is
 * useless.
 *
 * `pos` is MEASURED from `calculateOrderTotals`, not hand-derived — which is
 * why it is not six decimals throughout. WooCommerce stores money per field and
 * order-math mirrors it field for field: `cart_tax` keeps full precision
 * (`6.71328`) because WC sums per-rate taxes unrounded, while `total` and
 * `total_tax` are already at display decimals (`36.68` / `6.71`) because
 * `set_total` and `wc_round_tax_total` put them there.
 */
export type OrderMoneyOracle = {
	scenario: {
		currency: string;
		pricesIncludeTax: boolean;
		priceDecimals: number;
		taxRoundAtSubtotal: boolean;
		lines: { quantity: number; price: string }[];
		rates: { id: number; label: string; rate: string; compound: boolean }[];
		arithmetic: Record<string, string>;
	};
	/** The order as the POS computes it (measured from order-math). */
	pos: Record<string, unknown>;
	/**
	 * The order as the plugin serves it since woocommerce-pos#1466 — `dp=6` on
	 * every WCPOS order surface. Genuine six decimals for `cart_tax` and every
	 * line value; order-level `total` / `total_tax` are 2dp VALUES padded to a
	 * six-decimal STRING, because WC stores them at display decimals.
	 */
	server6dp: Record<string, unknown>;
	/** The legacy pre-#1466 shape: display decimals throughout (version skew). */
	server2dp: Record<string, unknown>;
};

export const ORDER_MONEY_ORACLE = oracle as unknown as OrderMoneyOracle;

/** The line uuid the oracle's single line item carries (line-level pairing key). */
export const ORDER_MONEY_ORACLE_LINE_UUID = '0f1e2d3c-4b5a-4697-8899-aabbccddeeff';
