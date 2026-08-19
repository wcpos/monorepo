// @vitest-environment node
import { describe, expect, it } from 'vitest';

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
});
