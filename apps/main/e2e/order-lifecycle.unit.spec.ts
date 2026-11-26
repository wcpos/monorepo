import { expect, test } from './test';
import {
	cartRecordUuidFromTabId,
	createPushOrdersResponseMatcher,
	expectRateSetParity,
	expectTaxParity,
	isRunLabel,
	isStaleRevisionConflict,
	newRunLabel,
	posAppliedRateIds,
	RUN_LABEL_PATTERN,
	trashOrder,
} from './order-lifecycle';

import type { DeleteRefundsResult } from './search-probe';
import type { APIRequestContext, TestInfo } from '@playwright/test';

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

test.describe('cartRecordUuidFromTabId', () => {
	const UUID = '0b6f6c1e-2f4a-4c1d-9e3b-7a5d8c2f1e04';

	test('reads the uuid from open-order-tab-<uuid>', () => {
		expect(cartRecordUuidFromTabId(`open-order-tab-${UUID}`)).toBe(UUID);
	});

	test("is null for the blank cart's tab, a tab's sub-element, a bare prefix and no id", () => {
		expect(cartRecordUuidFromTabId('new-order-tab')).toBeNull();
		expect(cartRecordUuidFromTabId(`open-order-tab-${UUID}-amount`)).toBeNull();
		expect(cartRecordUuidFromTabId('open-order-tab-')).toBeNull();
		expect(cartRecordUuidFromTabId(null)).toBeNull();
	});
});

/**
 * #3657: on dev-pro a teardown cancel answered 409 "baseRevision is stale" and the
 * order stayed pos-open. The teardown re-reads once, re-proves ownership, and retries.
 */
test.describe('isStaleRevisionConflict', () => {
	test('is true for a 409 carrying either marker', () => {
		expect(isStaleRevisionConflict(409, '{"code":"woo_rxdb_sync_conflict"}')).toBe(true);
		expect(isStaleRevisionConflict(409, '{"message":"baseRevision is stale"}')).toBe(true);
	});

	test('is false for a 409 without them, a 422 and a 200', () => {
		expect(isStaleRevisionConflict(409, '{"code":"something_else"}')).toBe(false);
		expect(isStaleRevisionConflict(422, '{"code":"woo_rxdb_sync_conflict"}')).toBe(false);
		expect(isStaleRevisionConflict(200, 'baseRevision is stale')).toBe(false);
	});
});

test.describe('trashOrder stale-revision retry', () => {
	const LABEL = 'e2e-run-label-3657';
	const ORDER = { id: 77, uuid: '0b6f6c1e-2f4a-4c1d-9e3b-7a5d8c2f1e04', label: LABEL };
	const STALE = '{"code":"woo_rxdb_sync_conflict","message":"baseRevision is stale"}';

	function reply(status: number, body: unknown) {
		const text = typeof body === 'string' ? body : JSON.stringify(body);
		return {
			status: () => status,
			ok: () => status >= 200 && status < 300,
			text: async () => text,
			json: async () => JSON.parse(text),
		};
	}

	/** Reads answer `reads` in order; posts answer `posts` in order and are recorded. */
	function fakes(reads: Record<string, unknown>[], posts: ReturnType<typeof reply>[]) {
		const posted: { status: string; baseRevision: unknown; mutationId: string }[] = [];
		const request = {
			get: async () => reply(200, [reads.shift()]),
			post: async (_url: string, options: { data: Record<string, unknown> }) => {
				const data = options.data as {
					payload: { status: string };
					baseRevision: unknown;
					mutationId: string;
				};
				posted.push({
					status: data.payload.status,
					baseRevision: data.baseRevision,
					mutationId: data.mutationId,
				});
				const next = posts.shift();
				if (!next) throw new Error('unexpected extra post');
				return next;
			},
		} as unknown as APIRequestContext;
		const testInfo = {
			project: { use: { storeUrl: 'https://store.test' } },
			attach: async () => {},
		} as unknown as TestInfo;
		return { request, testInfo, posted };
	}

	const mine = (revision: string) => ({ id: 77, customer_note: LABEL, _rxdb_revision: revision });
	const notTrashable = reply(422, '{"code":"wcpos_status_not_pushable"}');

	test('retries a stale cancel once with the re-read revision and succeeds', async () => {
		const { request, testInfo, posted } = fakes(
			[mine('rev-1'), mine('rev-2')],
			[notTrashable, reply(409, STALE), reply(200, { document: { status: 'cancelled' } })]
		);
		const trashed: (readonly number[])[] = [];
		const trashAsWriter = async (_r: APIRequestContext, _s: string, ids: readonly number[]) => {
			trashed.push(ids);
			return { trashed: 1, failed: 0, skipped: 0 };
		};
		expect(await trashOrder(request, testInfo, null, ORDER, trashAsWriter)).toBe(true);
		expect(trashed).toEqual([[77]]);
		const cancels = posted.filter((post) => post.status === 'cancelled');
		expect(cancels).toHaveLength(2);
		expect(cancels[0].baseRevision).toBe('rev-1');
		expect(cancels[1].baseRevision).toBe('rev-2');
		expect(cancels[1].mutationId).not.toBe(cancels[0].mutationId);
	});

	test('does not retry when the re-read no longer carries this run label', async () => {
		const { request, testInfo, posted } = fakes(
			[mine('rev-1'), { ...mine('rev-2'), customer_note: 'someone else' }],
			[notTrashable, reply(409, STALE)]
		);
		expect(await trashOrder(request, testInfo, null, ORDER)).toBe(false);
		expect(posted.filter((post) => post.status === 'cancelled')).toHaveLength(1);
	});

	test('retries at most once when the retry is stale again', async () => {
		const { request, testInfo, posted } = fakes(
			[mine('rev-1'), mine('rev-2'), mine('rev-3')],
			[notTrashable, reply(409, STALE), reply(409, STALE)]
		);
		expect(await trashOrder(request, testInfo, null, ORDER)).toBe(false);
		expect(posted.filter((post) => post.status === 'cancelled')).toHaveLength(2);
	});
});

test.describe('run label marker', () => {
	test('pins the pattern text', () => {
		// The dev-pro refund residue clean-up PHP (#3806) uses this exact text.
		expect(RUN_LABEL_PATTERN.source).toBe(
			'^wcpos-e2e \\S+ [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
		);
	});

	test('accepts every label newRunLabel mints', () => {
		for (let i = 0; i < 10; i += 1) expect(isRunLabel(newRunLabel())).toBe(true);
	});

	test('rejects notes that are not exactly a run label', () => {
		const notes: unknown[] = [
			'wcpos-e2e',
			'wcpos-e2e coupon probe (safe to delete)',
			'e2e-run-label-3657',
			`${newRunLabel()} extra`,
			`note: ${newRunLabel()}`,
			'',
			undefined,
			42,
		];
		for (const note of notes) expect(isRunLabel(note), String(note)).toBe(false);
	});
});

test.describe('trashOrder refunds', () => {
	const LABEL = newRunLabel();
	const ORDER = { id: 77, uuid: '0b6f6c1e-2f4a-4c1d-9e3b-7a5d8c2f1e04', label: LABEL };

	function reply(status: number, body: unknown) {
		const text = typeof body === 'string' ? body : JSON.stringify(body);
		return {
			status: () => status,
			ok: () => status >= 200 && status < 300,
			text: async () => text,
			json: async () => JSON.parse(text),
		};
	}

	/** Reads answer `reads` in order; posts answer `posts` in order and are recorded. */
	function fakes(reads: Record<string, unknown>[], posts: ReturnType<typeof reply>[]) {
		const posted: { status: string; baseRevision: unknown }[] = [];
		const request = {
			get: async () => reply(200, [reads.shift()]),
			post: async (_url: string, options: { data: Record<string, unknown> }) => {
				const data = options.data as { payload: { status: string }; baseRevision: unknown };
				posted.push({ status: data.payload.status, baseRevision: data.baseRevision });
				const next = posts.shift();
				if (!next) throw new Error('unexpected extra post');
				return next;
			},
		} as unknown as APIRequestContext;
		const testInfo = {
			project: { use: { storeUrl: 'https://store.test' } },
			attach: async () => {},
		} as unknown as TestInfo;
		return { request, testInfo, posted };
	}

	/** A deleter that records each call and how many posts were made before it. */
	function deleter(posted: unknown[], answer: DeleteRefundsResult) {
		const calls: { orderId: number; ids: readonly number[]; postsBefore: number }[] = [];
		const deleteRefunds = async (
			_r: APIRequestContext,
			_s: string,
			orderId: number,
			ids: readonly number[]
		) => {
			calls.push({ orderId, ids, postsBefore: posted.length });
			return answer;
		};
		return { calls, deleteRefunds };
	}

	const refunded = (revision: string, refunds: { id: number }[]) => ({
		id: 77,
		customer_note: LABEL,
		_rxdb_revision: revision,
		refunds,
	});
	const notTrashable = reply(422, '{"code":"wcpos_status_not_pushable"}');
	const cancelled = reply(200, { document: { status: 'cancelled' } });
	const trashAsWriter = async () => ({ trashed: 1, failed: 0, skipped: 0 });

	test("deletes a labelled order's refunds after the status lands, then trashes", async () => {
		const { request, testInfo, posted } = fakes(
			[refunded('rev-1', [{ id: 501 }, { id: 502 }])],
			[notTrashable, cancelled]
		);
		const { calls, deleteRefunds } = deleter(posted, { deleted: 2, failed: 0, skipped: 0 });
		const trashed: number[] = [];
		const trashAfter = async () => {
			trashed.push(calls.length);
			return { trashed: 1, failed: 0, skipped: 0 };
		};
		expect(await trashOrder(request, testInfo, null, ORDER, trashAfter, deleteRefunds)).toBe(true);
		expect(calls).toEqual([{ orderId: 77, ids: [501, 502], postsBefore: 2 }]);
		const cancels = posted.filter((post) => post.status === 'cancelled');
		expect(cancels).toHaveLength(1);
		expect(cancels[0].baseRevision).toBe('rev-1');
		expect(trashed).toEqual([1]);
	});

	test('leaves refunds alone on an order without a run label', async () => {
		const unlabelled = { ...ORDER, label: 'e2e-run-label-3657' };
		const { request, testInfo, posted } = fakes(
			[{ ...refunded('rev-1', [{ id: 501 }]), customer_note: 'e2e-run-label-3657' }],
			[notTrashable, cancelled]
		);
		const { calls, deleteRefunds } = deleter(posted, { deleted: 1, failed: 0, skipped: 0 });
		expect(
			await trashOrder(request, testInfo, null, unlabelled, trashAsWriter, deleteRefunds)
		).toBe(true);
		expect(calls).toEqual([]);
	});

	test('still trashes the order when the refunds cannot be deleted', async () => {
		const { request, testInfo, posted } = fakes(
			[refunded('rev-1', [{ id: 501 }, { id: 502 }])],
			[notTrashable, cancelled]
		);
		const { deleteRefunds } = deleter(posted, { deleted: 0, failed: 0, skipped: 1 });
		expect(await trashOrder(request, testInfo, null, ORDER, trashAsWriter, deleteRefunds)).toBe(
			true
		);
		expect(posted.filter((post) => post.status === 'cancelled')).toHaveLength(1);
	});

	test('deletes nothing when no status is ever applied', async () => {
		const { request, testInfo, posted } = fakes(
			[refunded('rev-1', [{ id: 501 }])],
			[notTrashable, notTrashable]
		);
		const { calls, deleteRefunds } = deleter(posted, { deleted: 1, failed: 0, skipped: 0 });
		expect(await trashOrder(request, testInfo, null, ORDER, trashAsWriter, deleteRefunds)).toBe(
			false
		);
		expect(calls).toEqual([]);
	});

	test('a delete that throws still resolves true and still trashes', async () => {
		const { request, testInfo } = fakes(
			[refunded('rev-1', [{ id: 501 }])],
			[notTrashable, cancelled]
		);
		const trashed: number[][] = [];
		const trashAfter = async (_r: APIRequestContext, _s: string, ids: readonly number[]) => {
			trashed.push([...ids]);
			return { trashed: 1, failed: 0, skipped: 0 };
		};
		const throwing = async (): Promise<DeleteRefundsResult> => {
			throw new Error('refund delete failed');
		};
		expect(await trashOrder(request, testInfo, null, ORDER, trashAfter, throwing)).toBe(true);
		expect(trashed).toEqual([[77]]);
	});
});
