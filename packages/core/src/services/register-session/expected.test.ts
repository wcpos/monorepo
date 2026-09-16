import { attributeRefunds, deriveExpected } from './expected';

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
	expect(attributeRefunds('A', rows, [refund])).toEqual({ byMethod: { cash: 0 }, count: 0 });
	expect(attributeRefunds('B', rows, [refund])).toEqual({ byMethod: { cash: 200000 }, count: 1 });
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
