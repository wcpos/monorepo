import { readPayPageMessage } from './pay-page-message';

const UUID = '5b8e1a3c-2f4d-4a6b-9c8e-000000000042';
const snapshot = {
	id: 42,
	status: 'completed',
	meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID }],
};

describe('readPayPageMessage', () => {
	it.each([
		[
			'received with a stamped order',
			{ action: 'wcpos-payment-received', payload: snapshot },
			{ kind: 'received', snapshot },
		],
		[
			'received with payload.data is still received',
			{ action: 'wcpos-payment-received', payload: { ...snapshot, data: { x: 1 } } },
			{ kind: 'received', snapshot: { ...snapshot, data: { x: 1 } } },
		],
		[
			'received with no payload',
			{ action: 'wcpos-payment-received' },
			{ kind: 'received-unreadable' },
		],
		[
			'received with an unstamped order',
			{ action: 'wcpos-payment-received', payload: { id: 42, status: 'completed', meta_data: [] } },
			{ kind: 'received-unreadable' },
		],
		[
			'blocked with data and a message',
			{ action: 'wcpos-payment-blocked', payload: { data: { code: 'x' }, message: 'Declined' } },
			{
				kind: 'blocked',
				action: 'wcpos-payment-blocked',
				message: 'Declined',
				payload: { data: { code: 'x' }, message: 'Declined' },
			},
		],
		[
			'blocked with a blank message has none',
			{ action: 'wcpos-payment-blocked', payload: { data: 1, message: '  ' } },
			{ kind: 'blocked', action: 'wcpos-payment-blocked', payload: { data: 1, message: '  ' } },
		],
		[
			'blocked without payload.data',
			{ action: 'wcpos-payment-blocked', payload: { message: 'x' } },
			{ kind: 'ignored' },
		],
		[
			'any other action with payload.data is a refusal',
			{ action: 'wcpos-something', payload: { data: true, message: 5 } },
			{ kind: 'refused', action: 'wcpos-something', payload: { data: true, message: 5 } },
		],
		[
			'payload.data with no action is a refusal',
			{ payload: { data: 'x' } },
			{ kind: 'refused', action: undefined, payload: { data: 'x' } },
		],
		[
			'session expiry comes first, even with payload.data',
			{ action: 'wcpos-session-expired', orderId: '42', payload: { data: 1 } },
			{ kind: 'session-expired', orderId: 42 },
		],
		[
			'session expiry with no order id',
			{ action: 'wcpos-session-expired' },
			{ kind: 'session-expired', orderId: NaN },
		],
		['an unknown action', { action: 'wcpos-other' }, { kind: 'ignored' }],
		['a non-JSON string', 'not json', { kind: 'ignored' }],
		['null', null, { kind: 'ignored' }],
		['undefined', undefined, { kind: 'ignored' }],
	])('%s', (_name, data, expected) => {
		expect(readPayPageMessage(data)).toEqual(expected);
	});
});

describe('readPayPageMessage: what counts as a readable order snapshot', () => {
	it.each([
		['a stamped plain order', snapshot, true],
		['an array', [snapshot], false],
		['a class instance', Object.assign(new (class Order {})(), snapshot), false],
		['id zero', { ...snapshot, id: 0 }, false],
		['a string id', { ...snapshot, id: '42' }, false],
		['a blank status', { ...snapshot, status: ' ' }, false],
		[
			'a non-uuid stamp',
			{ ...snapshot, meta_data: [{ key: '_woocommerce_pos_uuid', value: 'x' }] },
			false,
		],
		['no meta_data', { id: 42, status: 'completed' }, false],
	])('%s → received %s', (_name, payload, expected) => {
		expect(readPayPageMessage({ action: 'wcpos-payment-received', payload }).kind).toBe(
			expected ? 'received' : 'received-unreadable'
		);
	});
});
