// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { buildCoverageDocumentsFromQueryResult } from './query-coverage-writes';

describe('buildCoverageDocumentsFromQueryResult', () => {
	it('creates persisted records and a complete lane from a bounded query result', () => {
		expect(
			buildCoverageDocumentsFromQueryResult({
				collection: 'orders',
				queryKey: 'orders:open',
				records: [{ id: 'order-2' }, { id: 'order-1' }],
				complete: true,
				nowMs: 1_000,
				freshForMs: 500,
			})
		).toEqual({
			records: [
				{
					collection: 'orders',
					documentId: 'order-2',
					coveredQueryKeys: ['orders:open'],
					freshUntilMs: 1_500,
					updatedAtMs: 1_000,
				},
				{
					collection: 'orders',
					documentId: 'order-1',
					coveredQueryKeys: ['orders:open'],
					freshUntilMs: 1_500,
					updatedAtMs: 1_000,
				},
			],
			lanes: [
				{
					collection: 'orders',
					queryKey: 'orders:open',
					complete: true,
					expectedRecordIds: ['order-2', 'order-1'],
					freshUntilMs: 1_500,
					updatedAtMs: 1_000,
				},
			],
		});
	});

	it('creates a complete empty lane for a bounded query result with zero records', () => {
		expect(
			buildCoverageDocumentsFromQueryResult({
				collection: 'orders',
				queryKey: 'orders:empty',
				records: [],
				complete: true,
				nowMs: 2_000,
				freshForMs: 250,
			})
		).toEqual({
			records: [],
			lanes: [
				{
					collection: 'orders',
					queryKey: 'orders:empty',
					complete: true,
					expectedRecordIds: [],
					freshUntilMs: 2_250,
					updatedAtMs: 2_000,
				},
			],
		});
	});
});
