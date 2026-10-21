import { toMinor } from '@wcpos/order-math';

import {
	attributeRefunds,
	deriveDrawerTerms,
	deriveExpected,
	deriveUnsyncedDelta,
} from '../../src/register-session/expected';

it('derives captured session cash and card net of refunds and non-voided movements', () => {
	const result = deriveExpected({
		session: { id: 'session', counted_float: '100' },
		ledgerRowsBySession: [
			{
				session_id: 'session',
				kind: 'cash',
				method_id: 'cash',
				status: 'captured',
				amount: '50',
				refunded_amount: '10',
			},
			{
				session_id: 'session',
				kind: 'card',
				method_id: 'card',
				status: 'captured',
				amount: '30',
				refunded_amount: '0',
			},
			{
				session_id: 'other',
				kind: 'cash',
				method_id: 'cash',
				status: 'captured',
				amount: '999',
				refunded_amount: '0',
			},
			{
				session_id: 'session',
				kind: 'cash',
				method_id: 'cash',
				status: 'authorized',
				amount: '999',
				refunded_amount: '0',
			},
		],
		movements: [
			{ id: 'in', session_id: 'session', type: 'paid_in', amount: '20' },
			{ id: 'out', session_id: 'session', type: 'paid_out', amount: '5' },
			{ id: 'voided', session_id: 'session', type: 'paid_out', amount: '7', voided_by: 'void' },
			{ id: 'void', session_id: 'session', type: 'void', amount: '7', voids: 'voided' },
		],
	});
	expect(result).toEqual({ cash: '155.0000', card: '30.0000' });
});

const sale = {
	id: 'sale',
	session_id: 'A',
	kind: 'cash',
	method_id: 'cash',
	status: 'captured',
	amount: '100',
	refunded_amount: '0',
};
const refund = {
	id: 20,
	parent_id: 1,
	date_created_gmt: '2026-09-15T10:00:00',
	amount: '20',
	meta_data: [{ key: '_wcpos_session', value: 'B' }],
};

// Revert Math.max(0, ...) on legacy: the lagging aggregate credits A an extra 15.
it('does not credit the drawer when the aggregate lags stamped allocations', () => {
	const rows = [
		{
			...sale,
			refunded_amount: '5',
			refunds: [{ id: 20, amount: '20', status: 'succeeded' }],
		},
	];
	const input = { movements: [], ledgerRowsBySession: rows, refundRecords: [refund] };
	expect(deriveExpected({ ...input, session: { id: 'A', counted_float: '10' } })).toEqual({
		cash: '110.0000',
	});
	expect(deriveExpected({ ...input, session: { id: 'B', counted_float: '10' } })).toEqual({
		cash: '-10.0000',
	});
	expect(attributeRefunds('A', rows, [refund])).toEqual({
		byMethod: { cash: 0 },
		count: 0,
		countByMethod: {},
	});
	expect(attributeRefunds('B', rows, [refund])).toEqual({
		byMethod: { cash: 200000 },
		count: 1,
		countByMethod: { cash: 1 },
	});
});

// Revert the stamped-refund cash debit in attributeRefunds: Tuesday's drawer loses its refund.
it('keeps Monday cash sales in A and debits an unallocated Tuesday refund in B', () => {
	const input = { movements: [], ledgerRowsBySession: [sale], refundRecords: [refund] };
	expect(deriveExpected({ ...input, session: { id: 'A', counted_float: '10' } })).toEqual({
		cash: '110.0000',
	});
	expect(deriveExpected({ ...input, session: { id: 'B', counted_float: '10' } })).toEqual({
		cash: '-10.0000',
	});
});

// Revert covered-allocation subtraction or allocation tender/session attribution: A double-debits or B loses the split.
it('moves succeeded split allocations to the refund session without moving legacy refunds', () => {
	const input = {
		movements: [],
		refundRecords: [
			refund,
			{ ...refund, id: 21, meta_data: [] },
			{ ...refund, id: 22, meta_data: [] },
		],
		ledgerRowsBySession: [
			{
				...sale,
				refunded_amount: '9',
				refunds: [
					{ id: 20, amount: '7', status: 'succeeded' },
					{ id: 21, amount: '2', status: 'succeeded' },
				],
			},
			{
				...sale,
				id: 'card',
				kind: 'card',
				method_id: 'stripe',
				amount: '30',
				refunded_amount: '13',
				refunds: [{ id: 20, amount: '13', status: 'succeeded' }],
			},
		],
	};
	expect(deriveExpected({ ...input, session: { id: 'A', counted_float: '0' } })).toEqual({
		cash: '98.0000',
		stripe: '30.0000',
	});
	expect(deriveExpected({ ...input, session: { id: 'B', counted_float: '0' } })).toEqual({
		cash: '-7.0000',
		stripe: '-13.0000',
	});
});

// Revert the succeeded-only allocation filter: pending/failed allocations suppress the ruled cash fallback.
it.each(['pending', 'failed'])('uses cash fallback when the only allocation is %s', (status) => {
	const input = {
		session: { id: 'B', counted_float: '0' },
		movements: [],
		refundRecords: [
			refund,
			{ ...refund, id: 21, meta_data: [] },
			{ ...refund, id: 22, meta_data: [] },
		],
		ledgerRowsBySession: [
			{ ...sale, kind: 'card', method_id: 'stripe', refunds: [{ id: 20, amount: '20', status }] },
		],
	};
	expect(deriveExpected(input)).toEqual({ cash: '-20.0000' });
});

// Restore allocated.has(id): the successful 7 suppresses the remaining 13 cash debit.
it('debits the unallocated remainder to cash without adding a remainder to a fully allocated refund', () => {
	const rows = [
		{ ...sale, refunded_amount: '7', refunds: [{ id: 20, amount: '7', status: 'succeeded' }] },
		{
			...sale,
			kind: 'card',
			method_id: 'card',
			refunded_amount: '0',
			refunds: [{ id: 20, amount: '13', status: 'failed' }],
		},
	];
	const input = {
		session: { id: 'B', counted_float: '0' },
		movements: [],
		ledgerRowsBySession: rows,
		refundRecords: [refund],
	};
	expect(deriveExpected(input)).toEqual({ cash: '-20.0000' });
	expect(attributeRefunds('B', rows, [refund])).toEqual({
		byMethod: { cash: 200000 },
		count: 1,
		countByMethod: { cash: 1 },
	});
	rows[1].refunds[0].status = 'succeeded';
	rows[1].refunded_amount = '13';
	expect(deriveExpected(input)).toEqual({ cash: '-7.0000', card: '-13.0000' });
});

// Removing session/capture/void filters or folding the wrong movement changes these terms.
it('derives the drawer terms in display units from captured session cash and live movements', () => {
	const result = deriveDrawerTerms({
		session: { id: 'A', counted_float: '100' },
		ledgerRowsBySession: [
			{ ...sale, amount: '40.1234', refunded_amount: '5' },
			{ ...sale, id: 'second', amount: '60' },
			{ ...sale, session_id: 'other', amount: '999' },
			{ ...sale, status: 'authorized', amount: '999' },
			{ ...sale, kind: 'card', method_id: 'stripe', amount: '999' },
		],
		movements: [
			{ id: 'in', session_id: 'A', type: 'paid_in', amount: '20', reason: 'change' },
			{ id: 'out1', session_id: 'A', type: 'paid_out', amount: '10', reason: 'bank' },
			{ id: 'out2', session_id: 'A', type: 'paid_out', amount: '15', reason: 'supplies' },
			{ id: 'voided', session_id: 'A', type: 'paid_out', amount: '999', voided_by: 'v1' },
			{ id: 'voided2', session_id: 'A', type: 'paid_out', amount: '999' },
			{ id: 'v1', session_id: 'A', type: 'void', amount: '999', voids: 'voided' },
			{ id: 'v2', session_id: 'A', type: 'void', amount: '999', voids: 'voided2' },
			{ id: 'no-sale', session_id: 'A', type: 'no_sale', amount: '0' },
			{ id: 'other', session_id: 'B', type: 'paid_in', amount: '999' },
		],
	});
	expect(result).toEqual({
		float: '100.0000',
		cashSales: { amount: '100.1234', count: 2 },
		paidIn: [{ amount: '20.0000', note: 'change' }],
		paidOut: { amount: '25.0000', count: 2, note: undefined },
		cashRefunds: { amount: '5.0000', count: 1 },
		noSales: 1,
		voids: 2,
		expected: '190.1234',
	});
});
it('keeps a single paid-out reason and attributes refunds to their own session', () => {
	expect(
		deriveDrawerTerms({
			session: { id: 'B', counted_float: '30' },
			ledgerRowsBySession: [sale],
			refundRecords: [refund],
			movements: [{ id: 'out', session_id: 'B', type: 'paid_out', amount: '2', reason: 'bank' }],
		})
	).toEqual({
		float: '30.0000',
		cashSales: { amount: '0.0000', count: 0 },
		paidIn: [],
		paidOut: { amount: '2.0000', count: 1, note: 'bank' },
		cashRefunds: { amount: '20.0000', count: 1 },
		noSales: 0,
		voids: 0,
		expected: '8.0000',
	});
});

it('counts only the refunds attributed to cash in the drawer terms', () => {
	const session = { id: 'S', counted_float: '100.0000' };
	const stamp = { key: '_wcpos_session', value: 'S' };
	const refundRecords = [
		{ id: 1, amount: '5.0000', meta_data: [stamp] },
		{ id: 2, amount: '7.0000', meta_data: [stamp] },
	] as unknown as Parameters<typeof attributeRefunds>[2];
	const ledgerRowsBySession = [
		{
			session_id: 'S',
			kind: 'cash',
			method_id: 'cash',
			status: 'captured',
			amount: '20.0000',
			refunded_amount: '5.0000',
			refunds: [{ id: 1, amount: '5.0000', status: 'succeeded' }],
		},
		{
			session_id: 'S',
			kind: 'card',
			method_id: 'stripe',
			status: 'captured',
			amount: '30.0000',
			refunded_amount: '7.0000',
			refunds: [{ id: 2, amount: '7.0000', status: 'succeeded' }],
		},
	];
	const terms = deriveDrawerTerms({ session, movements: [], ledgerRowsBySession, refundRecords });
	expect(terms.cashRefunds).toEqual({ amount: '5.0000', count: 1 });
});

it('counts a refund split across cash and card once per method', () => {
	const session = { id: 'S', counted_float: '100.0000' };
	const stamp = { key: '_wcpos_session', value: 'S' };
	const refundRecords = [{ id: 9, amount: '12.0000', meta_data: [stamp] }] as unknown as Parameters<
		typeof deriveDrawerTerms
	>[0]['refundRecords'];
	const ledgerRowsBySession = [
		{
			session_id: 'S',
			kind: 'card',
			method_id: 'stripe',
			status: 'captured',
			amount: '30.0000',
			refunded_amount: '7.0000',
			refunds: [{ id: 9, amount: '7.0000', status: 'succeeded' }],
		},
		{
			session_id: 'S',
			kind: 'cash',
			method_id: 'cash',
			status: 'captured',
			amount: '20.0000',
			refunded_amount: '5.0000',
			refunds: [{ id: 9, amount: '5.0000', status: 'succeeded' }],
		},
	];
	const refunds = attributeRefunds('S', ledgerRowsBySession, refundRecords!);
	expect(refunds.count).toBe(1);
	expect(refunds.countByMethod).toEqual({ stripe: 1, cash: 1 });
	expect(
		deriveDrawerTerms({ session, movements: [], ledgerRowsBySession, refundRecords }).cashRefunds
	).toEqual({
		amount: '5.0000',
		count: 1,
	});
});

it('counts cash sales by order, so a split cash payment is one sale', () => {
	const session = { id: 'S', counted_float: '0.0000' };
	const leg = (order: string, amount: string) => ({
		order,
		session_id: 'S',
		kind: 'cash',
		method_id: 'cash',
		status: 'captured',
		amount,
		refunded_amount: '0.0000',
	});
	const terms = deriveDrawerTerms({
		session,
		movements: [],
		ledgerRowsBySession: [leg('o1', '10.0000'), leg('o1', '5.0000'), leg('o2', '20.0000')],
	});
	expect(terms.cashSales).toEqual({ amount: '35.0000', count: 2 });
});

// A filtered derivation misses the reversal of a movement already in the baseline.
it.each(['synced', 'pending'])('reverses a voided %s movement only once', (syncStatus) => {
	const input = {
		session: { id: 'session', counted_float: '100' },
		ledgerRowsBySession: [],
		movements: [
			{ id: 'in', session_id: 'session', type: 'paid_in', amount: '20', voided_by: 'void' },
			{ id: 'void', session_id: 'session', type: 'void', amount: '20', voids: 'in' },
		],
	};
	const baselineHas = (id: string | number | null | undefined) =>
		id === 'in' && syncStatus === 'synced';
	expect(
		deriveExpected(
			{ ...input, session: { ...input.session, server_expected: { cash: '100' } } },
			baselineHas
		).cash
	).toBe(syncStatus === 'synced' ? '80.0000' : '100');
	expect(deriveUnsyncedDelta(input, baselineHas)).toEqual({
		cash: syncStatus === 'synced' ? '-20.0000' : '0.0000',
	});
});

describe('drawer terms anchored to the server terms', () => {
	// Two devices on one register: the other device's 500 of sales and 50 paid in are only on
	// the server. The strip once showed 100 + 579 = 724 because its chips were this device's own.
	const serverTerms = {
		float: '100.0000',
		cash_sales: { amount: '579.0000', count: 3 },
		paid_in: [{ amount: '50.0000', reason: 'change' }],
		paid_out: { amount: '5.0000', count: 1, note: 'milk' },
		cash_refunds: { amount: '0.0000', count: 0 },
		no_sales: 0,
		voids: 0,
	};
	const leg = (id: string, order: string, amount: string, status = 'captured') => ({
		id,
		order,
		session_id: 'S',
		kind: 'cash',
		method_id: 'cash',
		status,
		amount,
		refunded_amount: '0.0000',
	});
	const session = {
		id: 'S',
		counted_float: '100.0000',
		server_expected: { cash: '724.0000' },
		server_terms: serverTerms,
		server_ledger_rows: [{ id: 'leg1', status: 'captured' }],
	};
	const outMilk = { id: 'out1', session_id: 'S', type: 'paid_out', amount: '5', reason: 'milk' };
	const baseline = new Set<string | number | null | undefined>(['leg1', 'out1']);
	const baselineHas = (id: string | number | null | undefined) => baseline.has(id);
	const sum = (terms: ReturnType<typeof deriveDrawerTerms>) =>
		toMinor(terms.float, 4) +
		toMinor(terms.cashSales.amount, 4) +
		terms.paidIn.reduce((total, row) => total + toMinor(row.amount, 4), 0) -
		toMinor(terms.paidOut.amount, 4) -
		toMinor(terms.cashRefunds.amount, 4);

	it('shows the server terms when the baseline holds every local row', () => {
		const input = {
			session,
			movements: [outMilk],
			ledgerRowsBySession: [leg('leg1', 'o1', '79.0000')],
		};
		const terms = deriveDrawerTerms(input, baselineHas);
		expect(terms).toEqual({
			float: '100.0000',
			cashSales: { amount: '579.0000', count: 3 },
			paidIn: [{ amount: '50.0000', note: 'change' }],
			paidOut: { amount: '5.0000', count: 1, note: 'milk' },
			cashRefunds: { amount: '0.0000', count: 0 },
			noSales: 0,
			voids: 0,
			expected: deriveExpected(input, baselineHas).cash,
		});
		expect(sum(terms)).toBe(toMinor(terms.expected, 4));
		expect(toMinor(terms.expected, 4)).toBe(toMinor('724', 4));
	});

	it('adds an unsynced cash sale and paid-in to the matching terms', () => {
		const input = {
			session,
			movements: [
				outMilk,
				{ id: 'in2', session_id: 'S', type: 'paid_in', amount: '10', reason: 'top-up' },
			],
			ledgerRowsBySession: [leg('leg1', 'o1', '79.0000'), leg('leg2', 'o9', '20.0000')],
		};
		const terms = deriveDrawerTerms(input, baselineHas);
		expect(terms.cashSales).toEqual({ amount: '599.0000', count: 4 });
		expect(terms.paidIn).toEqual([
			{ amount: '50.0000', note: 'change' },
			{ amount: '10.0000', note: 'top-up' },
		]);
		expect(terms.paidOut).toEqual({ amount: '5.0000', count: 1, note: 'milk' });
		expect(terms.expected).toBe('754.0000');
		expect(sum(terms)).toBe(toMinor(terms.expected, 4));
	});

	it('takes a baseline-captured leg voided here out of cash sales', () => {
		const input = {
			session,
			movements: [outMilk],
			ledgerRowsBySession: [leg('leg1', 'o1', '79.0000', 'voided')],
		};
		const terms = deriveDrawerTerms(input, baselineHas);
		// Its order has no captured cash leg left, so the sale leaves the count too.
		expect(terms.cashSales).toEqual({ amount: '500.0000', count: 2 });
		expect(terms.expected).toBe('645.0000');
		expect(sum(terms)).toBe(toMinor(terms.expected, 4));
		// A split sale whose other cash leg still stands stays one sale.
		const split = deriveDrawerTerms(
			{ ...input, ledgerRowsBySession: [...input.ledgerRowsBySession, leg('leg1b', 'o1', '1')] },
			(id) => id === 'leg1b' || baselineHas(id)
		);
		expect(split.cashSales.count).toBe(3);
	});

	// ADR 0040 D6: the server's session figures count captured rows only, so an authorization
	// voided here was never in the baseline and must not be debited from it.
	it('a baseline-authorized leg voided here leaves the expected totals alone', () => {
		const card = { ...leg('auth1', 'o2', '30.0000', 'voided'), kind: 'card', method_id: 'card' };
		const input = {
			session: {
				...session,
				server_expected: { cash: '724.0000', card: '0.0000' },
				server_ledger_rows: [...session.server_ledger_rows, { id: 'auth1', status: 'authorized' }],
			},
			movements: [outMilk],
			ledgerRowsBySession: [leg('leg1', 'o1', '79.0000'), card],
		};
		const has = (id: string | number | null | undefined) => id === 'auth1' || baselineHas(id);
		expect(deriveExpected(input, has)).toEqual({ cash: '724.0000', card: '0.0000' });
	});

	it('counts a void-and-retender on one baseline order as the server counted it', () => {
		const input = {
			session,
			movements: [outMilk],
			// The counted leg is voided here and the same order is paid again, unsynced.
			ledgerRowsBySession: [leg('leg1', 'o1', '79.0000', 'voided'), leg('leg2', 'o1', '70.0000')],
		};
		const terms = deriveDrawerTerms(input, baselineHas);
		expect(terms.cashSales).toEqual({ amount: '570.0000', count: 3 });
		expect(sum(terms)).toBe(toMinor(terms.expected, 4));
	});

	const voidedChange = [
		outMilk,
		{ id: 'in1', session_id: 'S', type: 'paid_in', amount: '50', reason: 'change' },
		{ id: 'v1', session_id: 'S', type: 'void', amount: '50', voids: 'in1' },
	];
	const hasChange = (id: string | number | null | undefined) => id === 'in1' || baselineHas(id);

	it('drops a baseline paid-in voided here from the server list by its id', () => {
		const input = {
			// The id decides, even where the amount and reason would point elsewhere.
			session: {
				...session,
				server_terms: {
					...serverTerms,
					paid_in: [{ id: 'in1', amount: '50.0000', reason: 'float top-up' }],
				},
			},
			movements: voidedChange,
			ledgerRowsBySession: [leg('leg1', 'o1', '79.0000')],
		};
		const terms = deriveDrawerTerms(input, hasChange);
		expect(terms.paidIn).toEqual([]);
		expect(terms.voids).toBe(1);
		expect(terms.expected).toBe('674.0000');
		expect(sum(terms)).toBe(toMinor(terms.expected, 4));
	});

	it('matches by amount and reason when the server lists no ids, never listing a negative', () => {
		const input = {
			session,
			movements: voidedChange,
			ledgerRowsBySession: [leg('leg1', 'o1', '79.0000')],
		};
		const matched = deriveDrawerTerms(input, hasChange);
		expect(matched.paidIn).toEqual([]);
		expect(sum(matched)).toBe(toMinor(matched.expected, 4));
		// Nothing matches: the debit comes off the listed total instead of a negative row.
		const unmatched = deriveDrawerTerms(
			{
				...input,
				session: {
					...session,
					server_expected: { cash: '754.0000' },
					server_terms: { ...serverTerms, paid_in: [{ amount: '80.0000', reason: 'mixed' }] },
				},
			},
			hasChange
		);
		expect(unmatched.paidIn).toEqual([{ amount: '30.0000', note: 'mixed' }]);
		expect(unmatched.expected).toBe('704.0000');
		expect(sum(unmatched)).toBe(toMinor(unmatched.expected, 4));
	});

	it('derives the local terms when the server sends none', () => {
		const input = {
			session: { ...session, server_terms: null },
			movements: [outMilk],
			ledgerRowsBySession: [leg('leg1', 'o1', '79.0000')],
		};
		const { expected, ...chips } = deriveDrawerTerms(input, baselineHas);
		const { expected: _local, ...today } = deriveDrawerTerms(input);
		expect(chips).toEqual(today);
		expect(chips).toEqual({
			float: '100.0000',
			cashSales: { amount: '79.0000', count: 1 },
			paidIn: [],
			paidOut: { amount: '5.0000', count: 1, note: 'milk' },
			cashRefunds: { amount: '0.0000', count: 0 },
			noSales: 0,
			voids: 0,
		});
		expect(expected).toBe(deriveExpected(input, baselineHas).cash);
	});
});

it.each([undefined, null])('treats withheld or null cash inputs as zero (%s)', (value) => {
	const data = {
		session: { id: 'blind', ...(value === null ? { counted_float: null } : {}) },
		movements: [
			{
				id: 'paid-in',
				session_id: 'blind',
				type: 'paid_in',
				...(value === null ? { amount: null, reason: null } : {}),
			},
		],
		ledgerRowsBySession: [],
	};
	expect(deriveExpected(data)).toEqual({ cash: '0.0000' });
	expect(deriveDrawerTerms(data)).toMatchObject({
		float: '0.0000',
		paidIn: [{ amount: '0.0000' }],
		expected: '0.0000',
	});
});
