import { describe, expect, it } from 'vitest';

import { isDefinitiveMoneyRefusal, moneyRefusalOf } from './moneyCommandAnswer';

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
	])('a %i %s is definitive', (status, code) => {
		expect(isDefinitiveMoneyRefusal(moneyRefusalOf(wpError(status, code)))).toBe(true);
	});

	it.each([
		[409, 'wcpos_payment_locked'],
		[409, 'wcpos_revision_stale'],
		[401, 'rest_not_logged_in'],
		[403, 'rest_forbidden'],
		[408, 'request_timeout'],
		[426, 'wcpos_update_required'],
		[429, 'too_many_requests'],
		[500, 'internal_server_error'],
		[502, 'wcpos_provider_error'],
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
