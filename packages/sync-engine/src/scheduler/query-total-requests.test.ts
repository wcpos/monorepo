// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { hydrateResponse } from '../transport/response-envelope';
import { queryTotalFromResponse } from './query-total-requests';

describe('queryTotalFromResponse', () => {
	it('returns a non-negative integer X-WP-Total', () => {
		expect(queryTotalFromResponse(new Response(null, { headers: { 'X-WP-Total': '42' } }))).toBe(
			42
		);
	});

	it.each([undefined, '', ' ', '1.5', '-1', 'nope'])(
		'returns null for an absent or invalid total (%s)',
		(value) => {
			const headers = value === undefined ? undefined : { 'X-WP-Total': value };
			expect(queryTotalFromResponse(new Response(null, { headers }))).toBeNull();
		}
	);

	it.each(['header-only', 'body-only', 'both'] as const)(
		'reads the same total from a %s response',
		async (mode) => {
			const headers: Record<string, string> = mode === 'body-only' ? {} : { 'X-WP-Total': '42' };
			const body = mode === 'header-only' ? [] : { data: [], _wcpos: { v: 1, total: 42 } };
			const response = await hydrateResponse(new Response(JSON.stringify(body), { headers }), {
				envelopeRequested: true,
			});

			expect(queryTotalFromResponse(response)).toBe(42);
			expect(await response.json()).toEqual([]);
		}
	);
});
