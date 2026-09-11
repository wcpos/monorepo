import { deriveExpected } from './expected';

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
