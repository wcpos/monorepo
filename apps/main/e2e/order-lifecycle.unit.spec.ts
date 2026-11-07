import { expect, test } from './test';
import {
	cartRecordUuidFromUrl,
	createPushOrdersResponseMatcher,
	expectRateSetParity,
	expectTaxParity,
	posAppliedRateIds,
} from './order-lifecycle';

/**
 * Unit-style pins for the money-oracle helpers — no page, no store. These exist
 * because both helpers have now each shipped one JS-coercion hole
 * (`Number('') === 0`): expectTaxParity's missing-client pass (#1114 review)
 * and expectRateSetParity's blank-rate_id-as-rate-0 (#1116 review, wcpos-bot
 * escalation). Coercion edges get pinned here, where a red is cheap, instead
 * of surfacing as a false-green parity assertion against a live store.
 */
test.describe('expectRateSetParity', () => {
	test('accepts matching numeric rate sets in any order and spelling', () => {
		expectRateSetParity(['13', '14'], [{ rate_id: '14' }, { rate_id: 13 }], 'spelling/order');
	});

	test('treats missing arrays as the empty set (tax-free stores)', () => {
		expectRateSetParity([], undefined, 'empty vs missing');
	});

	test('fails on a set mismatch', () => {
		expect(() =>
			expectRateSetParity(['13'], [{ rate_id: 7 }, { rate_id: 10 }], 'mismatch')
		).toThrow();
	});

	test('rejects a BLANK server rate_id instead of coercing it to rate 0', () => {
		// Number('') === 0 and Number('  ') === 0 — both finite. Without the
		// non-blank guard these pass as rate "0" and can collide with a real 0.
		expect(() => expectRateSetParity(['0'], [{ rate_id: '' }], 'blank')).toThrow();
		expect(() => expectRateSetParity(['0'], [{ rate_id: '  ' }], 'whitespace')).toThrow();
	});

	test('rejects a missing or non-numeric server rate id', () => {
		expect(() => expectRateSetParity([], [{}], 'missing')).toThrow();
		expect(() => expectRateSetParity(['abc'], [{ rate_id: 'abc' }], 'non-numeric')).toThrow();
	});
});

/**
 * #1507: the POS's applied rate set now comes from the LINE taxes, because the
 * order's `tax_lines` are readonly aggregate the client stopped sending. The
 * same blank/non-numeric coercion holes apply on this side of the comparison,
 * so they are pinned here too.
 */
test.describe('posAppliedRateIds', () => {
	test('unions the rate ids across every line array, deduped and sorted', () => {
		expect(
			posAppliedRateIds({
				line_items: [
					{ taxes: [{ id: 14, total: '1.00' }, { id: 13 }] },
					{ taxes: [{ id: '13', total: '2.00' }] },
				],
				fee_lines: [{ taxes: [{ id: 9 }] }],
				shipping_lines: [{ taxes: [{ id: 13 }] }],
			})
		).toEqual(['13', '14', '9']);
	});

	test('is the empty set for a tax-free sale, and for lines with no taxes array', () => {
		expect(posAppliedRateIds({ line_items: [{ total: '10.00' }] })).toEqual([]);
		expect(posAppliedRateIds({})).toEqual([]);
	});

	test('rejects a BLANK or non-numeric line tax id instead of coercing it to rate 0', () => {
		expect(() => posAppliedRateIds({ line_items: [{ taxes: [{ id: '' }] }] })).toThrow();
		expect(() => posAppliedRateIds({ line_items: [{ taxes: [{ id: '  ' }] }] })).toThrow();
		expect(() => posAppliedRateIds({ line_items: [{ taxes: [{ id: 'abc' }] }] })).toThrow();
		expect(() => posAppliedRateIds({ line_items: [{ taxes: [{}] }] })).toThrow();
	});
});

test.describe('expectTaxParity', () => {
	test('accepts equality and the one-microunit tie at full width', () => {
		expectTaxParity('4.575163', '4.575164', 'tie');
		expectTaxParity('1.640000', '1.64', 'padding');
	});

	test('rejects a missing client value instead of coercing it to zero', () => {
		expect(() => expectTaxParity('0', '', 'missing client')).toThrow();
		expect(() => expectTaxParity('0', undefined, 'undefined client')).toThrow();
	});

	test('rejects two microunits and display-money drift', () => {
		expect(() => expectTaxParity('4.575162', '4.575164', 'two microunits')).toThrow();
		expect(() => expectTaxParity('1.65', '1.64', 'a whole cent')).toThrow();
	});
});

/**
 * #3372: a session can re-push an older order while a test waits for its own save,
 * so the matcher takes only the open cart's record, and a stranger's 401 must not
 * use up the fetcher's one refresh-and-retry cycle.
 */
test.describe('createPushOrdersResponseMatcher', () => {
	const CART = '0b6f6c1e-2f4a-4c1d-9e3b-7a5d8c2f1e04';
	const OTHER = '9d2c4b7a-1e3f-4a5b-8c6d-0e1f2a3b4c5d';
	const PRETTY = 'https://store.test/wp-json/wcpos/v2/push/orders?store_id=1';
	const PLAIN = 'https://store.test/?rest_route=/wcpos/v2/push/orders';

	function push(recordId: string, status: number, url = PRETTY, method = 'POST') {
		return {
			url: () => url,
			request: () => ({ method: () => method, postDataJSON: () => ({ recordId, payload: {} }) }),
			status: () => status,
		};
	}

	test("matches a 201 push for the cart's record", () => {
		expect(createPushOrdersResponseMatcher(CART)(push(CART, 201))).toBe(true);
	});

	test('skips a 200 push for another record', () => {
		expect(createPushOrdersResponseMatcher(CART)(push(OTHER, 200))).toBe(false);
	});

	test("matches the plain-permalink form for the cart's record", () => {
		expect(createPushOrdersResponseMatcher(CART)(push(CART, 201, PLAIN))).toBe(true);
	});

	test('skips a GET and a different route', () => {
		const matches = createPushOrdersResponseMatcher(CART);
		expect(matches(push(CART, 200, PRETTY, 'GET'))).toBe(false);
		expect(matches(push(CART, 200, 'https://store.test/wp-json/wcpos/v2/push/products'))).toBe(
			false
		);
	});

	test("for the cart's record, the first 401 is skipped and the second matches", () => {
		const matches = createPushOrdersResponseMatcher(CART);
		expect(matches(push(CART, 401))).toBe(false);
		expect(matches(push(CART, 401))).toBe(true);
	});

	test("another record's 401 does not use up the cart's retry cycle", () => {
		const matches = createPushOrdersResponseMatcher(CART);
		expect(matches(push(OTHER, 401))).toBe(false);
		expect(matches(push(CART, 401))).toBe(false);
		expect(matches(push(CART, 401))).toBe(true);
	});
});

test.describe('cartRecordUuidFromUrl', () => {
	const UUID = '0b6f6c1e-2f4a-4c1d-9e3b-7a5d8c2f1e04';

	test('reads the uuid after /cart/, under any base path and before any query', () => {
		expect(cartRecordUuidFromUrl(`/cart/${UUID}`)).toBe(UUID);
		expect(cartRecordUuidFromUrl(`/cart/${UUID}/checkout/cash`)).toBe(UUID);
		expect(cartRecordUuidFromUrl(`/shop/pos/cart/${UUID}?x=1`)).toBe(UUID);
	});

	test('is null on the blank cart, a receipt and any other page', () => {
		expect(cartRecordUuidFromUrl('/cart')).toBeNull();
		expect(cartRecordUuidFromUrl(`/cart/receipt/${UUID}`)).toBeNull();
		expect(cartRecordUuidFromUrl('/products')).toBeNull();
	});
});
