import { attributeRefunds, deriveDrawerTerms, deriveExpected } from './expected';

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
