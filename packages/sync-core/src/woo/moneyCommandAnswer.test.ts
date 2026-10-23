import { describe, expect, it } from 'vitest';

import {
	isCloseAnswer,
	isDefinitiveMoneyRefusal,
	isMoneyAnswer,
	isPaidStatus,
	moneyRefusalOf,
} from './moneyCommandAnswer';

const answer = (status: number, data: unknown) => ({ response: { status, data } });
const wpError = (status: number, code: string) =>
	answer(status, { code, message: code, data: { status } });

describe('the money command answer rule', () => {
	it.each([
		[400, 'woo_rxdb_sync_bad_envelope'],
		[404, 'rest_no_route'],
		[409, 'wcpos_currency_locked'],
		[409, 'wcpos_command_conflict'],
		[422, 'wcpos_fields_invalid'],
		[422, 'wcpos_some_code_nobody_listed'],
		[403, 'wcpos_payment_method_disabled'],
		[502, 'wcpos_provider_error'],
		[501, 'wcpos_capture_mode_unsupported'],
	])('a %i %s is definitive', (status, code) => {
		expect(isDefinitiveMoneyRefusal(moneyRefusalOf(wpError(status, code)))).toBe(true);
	});

	it.each([
		[409, 'wcpos_payment_locked'],
		[409, 'wcpos_revision_stale'],
		[401, 'rest_not_logged_in'],
		[403, 'rest_forbidden'],
		[407, 'proxy_authentication_required'],
		[408, 'request_timeout'],
		[426, 'wcpos_update_required'],
		[429, 'too_many_requests'],
		[500, 'internal_server_error'],
		[502, 'bad_gateway'],
		[503, 'wcpos_some_code_nobody_listed'],
	])('a %i %s is not definitive', (status, code) => {
		expect(isDefinitiveMoneyRefusal(moneyRefusalOf(wpError(status, code)))).toBe(false);
	});

	it('a network failure or a non-JSON body is not definitive', () => {
		expect(moneyRefusalOf(new Error('Network Error'))).toBeNull();
		expect(isDefinitiveMoneyRefusal(moneyRefusalOf(new Error('Network Error')))).toBe(false);
		expect(isDefinitiveMoneyRefusal(moneyRefusalOf(answer(404, '<html>proxy</html>')))).toBe(false);
	});

	it('reads the code, message and data of a WordPress error', () => {
		expect(
			moneyRefusalOf(answer(422, { code: 'c', message: 'm', data: { payment_id: 'p' } }))
		).toEqual({ status: 422, code: 'c', message: 'm', data: { payment_id: 'p' } });
	});
});

describe('the close answer rule', () => {
	it('accepts only a summary with a status and the completion it stamped', () => {
		const order = { status: 'completed' };
		expect(isCloseAnswer({ order, completion: { n: 2, id: 'c2' } })).toBe(true);
		for (const data of [
			null,
			{},
			'<html>proxy</html>',
			{ completion: { n: 1, id: 'c1' } },
			{ order: { total: '0.00' }, completion: { n: 1, id: 'c1' } },
			{ order },
			{ order, completion: { id: 'c1' } },
			{ order, completion: { n: '1', id: 'c1' } },
		])
			expect(isCloseAnswer(data)).toBe(false);
	});
});

describe('the money answer rule, per kind', () => {
	const row = { id: 'p1', status: 'captured', amount: '10.00' };
	const order = { status: 'pos-open' };
	it.each(['record', 'intent', 'capture', 'void'] as const)(
		'%s needs the row and the summary',
		(kind) => {
			expect(isMoneyAnswer(kind, { payment: row, order, revision: 'r' })).toBe(true);
			expect(isMoneyAnswer(kind, {})).toBe(false);
			expect(isMoneyAnswer(kind, { payment: row })).toBe(false);
			expect(isMoneyAnswer(kind, { order })).toBe(false);
			expect(isMoneyAnswer(kind, { payment: { id: 'p1', status: 'captured' }, order })).toBe(false);
			expect(isMoneyAnswer(kind, { payment: row, order: {} })).toBe(false);
		}
	);
	it('refund needs the row', () => {
		expect(isMoneyAnswer('refund', { payment: row })).toBe(true);
		expect(isMoneyAnswer('refund', { order })).toBe(false);
	});
	it('submit needs its outcome and the summary; cancel the summary', () => {
		expect(isMoneyAnswer('submit', { outcome: 'sent', payment: null, order })).toBe(true);
		expect(isMoneyAnswer('submit', { order })).toBe(false);
		expect(isMoneyAnswer('submit', { outcome: 'sent' })).toBe(false);
		expect(isMoneyAnswer('cancel', { order })).toBe(true);
		expect(isMoneyAnswer('cancel', {})).toBe(false);
	});
	it('close is the close rule', () => {
		expect(isMoneyAnswer('close', { order, completion: { n: 1, id: 'c1' } })).toBe(true);
		expect(isMoneyAnswer('close', { order })).toBe(false);
		expect(isMoneyAnswer('close', null)).toBe(false);
	});
});

// Server SPEC §4.3: a close whose stamp could not persist answers `completion: null` with the
// paid summary. It is completed, without a number; on an open summary it proves nothing.
describe('a close answered without a completion', () => {
	it.each(['completed', 'processing', 'on-hold', 'wc-custom-paid'])(
		'is completed when the summary is paid (%s)',
		(status) => {
			expect(isCloseAnswer({ order: { status }, completion: null })).toBe(true);
			expect(isMoneyAnswer('close', { order: { status }, completion: null })).toBe(true);
		}
	);
	it.each(['pos-open', 'pos-partial', 'pending', 'failed', 'cancelled', 'refunded'])(
		'is malformed when the summary is not paid (%s)',
		(status) => {
			expect(isCloseAnswer({ order: { status }, completion: null })).toBe(false);
			expect(isMoneyAnswer('close', { order: { status }, completion: null })).toBe(false);
		}
	);
	it('a missing completion is still malformed', () => {
		expect(isCloseAnswer({ order: { status: 'completed' } })).toBe(false);
	});
	it.each(['', '  ', undefined, null, 0, {}])(
		'a blank or non-string status is not paid (%p)',
		(status) => {
			expect(isPaidStatus(status)).toBe(false);
			expect(isCloseAnswer({ order: { status }, completion: null })).toBe(false);
		}
	);
	it.each(['completed', 'on-hold', 'wc-custom-paid'])(
		'a named status outside the blocklist is paid (%s)',
		(status) => {
			expect(isPaidStatus(status)).toBe(true);
		}
	);
});

// The server's submit vocabulary (`Gateway_Submission.php:71, 77-83, 370`): `recorded` carries
// the row it recorded; `sent`, `settled` and a replayed `paid` carry the summary alone.
describe('a submit answer', () => {
	const order = { status: 'pos-open' };
	const row = { id: 'a-1', status: 'captured', amount: '10.00' };
	it.each(['sent', 'settled', 'paid'])('%s needs the summary', (outcome) => {
		expect(isMoneyAnswer('submit', { outcome, payment: null, order })).toBe(true);
	});
	it('recorded needs its row', () => {
		expect(isMoneyAnswer('submit', { outcome: 'recorded', payment: row, order })).toBe(true);
		expect(isMoneyAnswer('submit', { outcome: 'recorded', payment: null, order })).toBe(false);
		expect(isMoneyAnswer('submit', { outcome: 'recorded', order: { status: 'completed' } })).toBe(
			false
		);
	});
	it('an outcome outside the vocabulary is malformed', () => {
		expect(isMoneyAnswer('submit', { outcome: 'charged', order })).toBe(false);
		expect(isMoneyAnswer('submit', { outcome: '', order })).toBe(false);
	});
});
