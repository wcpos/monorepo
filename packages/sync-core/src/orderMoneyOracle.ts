import oracle from '../contracts/write-contract/fixtures/order-money-oracle.json';

/**
 * THE shared money oracle (`contracts/write-contract/fixtures/order-money-oracle.json`),
 * typed for test use.
 *
 * It lives under `contracts/` rather than beside a test file on purpose: the
 * plugin's write-contract suite reads the same directory, so client and server
 * argue against ONE arithmetic instead of two hand-typed copies that drift.
 *
 * `pos` is the exact six-decimal order the POS computes; `server2dp` is the same
 * order as WooCommerce serializes it today — display decimals, because v2 push
 * acks are not `dp`-pinned (#946). They are the SAME MONEY. A comparator that
 * calls them divergent is over-strict; one that calls a real recalculation
 * equal is useless.
 */
export type OrderMoneyOracle = {
	scenario: {
		currency: string;
		pricesIncludeTax: boolean;
		lines: { quantity: number; price: string }[];
		rates: { id: number; label: string; rate: string; compound: boolean }[];
		arithmetic: Record<string, string>;
	};
	/** The POS-side order payload at full (six-decimal) precision. */
	pos: Record<string, unknown>;
	/** The same order as the server serializes it at display decimals. */
	server2dp: Record<string, unknown>;
};

export const ORDER_MONEY_ORACLE = oracle as unknown as OrderMoneyOracle;

/** The line uuid the oracle's single line item carries (line-level pairing key). */
export const ORDER_MONEY_ORACLE_LINE_UUID = '0f1e2d3c-4b5a-4697-8899-aabbccddeeff';
