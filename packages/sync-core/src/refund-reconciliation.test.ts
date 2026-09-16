import { describe, expect, it } from 'vitest';

import { reconcileRefundIds } from './refund-reconciliation';

describe('refund summary authority', () => {
	it('returns held ids absent from an explicit summary and missing summary ids', () => {
		expect(reconcileRefundIds([{ id: 2 }, { id: 3 }], [1, 2])).toEqual({
			remove: [1],
			missing: [3],
		});
	});
	it('an explicit empty summary deletes all held children', () => {
		expect(reconcileRefundIds([], [1, 2])).toEqual({ remove: [1, 2], missing: [] });
	});
	it.each([undefined, null, {}])('non-array %s is not evidence', (summary) => {
		expect(reconcileRefundIds(summary, [1])).toEqual({ remove: [], missing: [] });
	});
});
