import { describe, expect, it } from 'vitest';

import { assertBulkSuccess } from './assertBulkSuccess';

describe('assertBulkSuccess', () => {
	it('throws with every failed document id from a resolved RxDB bulk result', () => {
		expect(() =>
			assertBulkSuccess(
				{ error: [{ documentId: 'a', status: 409 }, { documentId: 'b' }] },
				'orders upsert'
			)
		).toThrow('orders upsert failed for 2 row(s): a, b');
	});
});
