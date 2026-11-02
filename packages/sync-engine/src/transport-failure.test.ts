import { describe, expect, it } from 'vitest';

import { ChangeSignalPoisonError } from './change-signal/change-signal-source';
import { markTransportFailure, requestStatusOf } from './transport-failure';
import { RequestTimeoutError } from './transport/request-timeout';

describe('requestStatusOf', () => {
	it('reads a deadline and a marked transport throw as a request with no response', () => {
		const offline = new TypeError('Failed to fetch');
		markTransportFailure(offline);

		expect(requestStatusOf(new RequestTimeoutError(60_000))).toBe(0);
		expect(requestStatusOf(offline)).toBe(0);
	});

	it('reads the status an error carries, a 2xx poison page included', () => {
		expect(requestStatusOf(new ChangeSignalPoisonError('poison', '/changes', 200))).toBe(200);
		expect(requestStatusOf(Object.assign(new Error('refused'), { status: 403 }))).toBe(403);
	});

	it.each([
		['Woo REST customer browse request failed: 400', 400],
		['/products trickle pull failed: HTTP 503', 503],
		['/changes pull failed: HTTP 500 — internal_error: boom', 500],
	])('reads the fetchers’ shared HTTP-failure message %j', (message, status) => {
		expect(requestStatusOf(new Error(message))).toBe(status);
	});

	it('reads an aggregate as reported only when every failure inside it was', () => {
		const reported = new AggregateError([
			new Error('existence scan fetch failed: 503'),
			new RequestTimeoutError(60_000),
		]);
		const mixed = new AggregateError([
			new Error('existence scan fetch failed: 503'),
			new SyntaxError('Unexpected token < in JSON'),
		]);

		expect(requestStatusOf(reported)).toBe(503);
		// The parse failure has no transport row: the aggregate is a local failure.
		expect(requestStatusOf(mixed)).toBeUndefined();
	});

	it('leaves a local failure without a status', () => {
		expect(requestStatusOf(new Error('bulkUpsert failed'))).toBeUndefined();
		// An unmarked TypeError is a bug, not the network.
		expect(requestStatusOf(new TypeError('x is not a function'))).toBeUndefined();
		expect(requestStatusOf('boom')).toBeUndefined();
	});
});
