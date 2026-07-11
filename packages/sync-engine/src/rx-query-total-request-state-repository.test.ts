// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { RxQueryTotalRequestStateRepository } from './rx-query-total-request-state-repository';

import type { QueryTotalRequestState } from './scheduler/query-total-request-lifecycle';

function state(overrides: Partial<QueryTotalRequestState> = {}): QueryTotalRequestState {
	return {
		queryKey: 'orders:browser:status=processing:limit=50',
		status: 'in-flight',
		ownerId: 'tab-a',
		claimedUntilMs: 2_000,
		attempt: 1,
		retryAfterMs: null,
		updatedAtMs: 1_000,
		request: null,
		...overrides,
	};
}

function createCollection(documents: QueryTotalRequestState[] = []) {
	const stored = new Map(documents.map((document) => [document.queryKey, { ...document }]));
	const insert = vi.fn(async (item: QueryTotalRequestState) => {
		if (stored.has(item.queryKey)) {
			const error = new Error('document conflict') as Error & { code: string };
			error.code = 'CONFLICT';
			throw error;
		}
		stored.set(item.queryKey, { ...item });
	});
	const bulkUpsert = vi.fn(async (items: QueryTotalRequestState[]) => {
		for (const item of items) stored.set(item.queryKey, { ...item });
	});
	const find = vi.fn((_query?: unknown) => ({
		exec: vi.fn(async () =>
			[...stored.values()].map((document) => ({ toJSON: () => ({ ...document }) }))
		),
	}));
	const findOne = vi.fn((queryKey: string) => ({
		exec: vi.fn(async () => {
			const document = stored.get(queryKey);
			if (!document) return null;
			return {
				toJSON: () => ({ ...document }),
				incrementalModify: vi.fn(
					async (
						mutator: (
							current: QueryTotalRequestState & { _deleted?: boolean }
						) => QueryTotalRequestState & { _deleted?: boolean }
					) => {
						const next = mutator({ ...document });
						if (next._deleted) {
							stored.delete(queryKey);
						} else {
							stored.set(queryKey, { ...next });
						}
					}
				),
			};
		}),
	}));
	return {
		collection: { insert, bulkUpsert, find, findOne },
		stored,
		insert,
		bulkUpsert,
		find,
		findOne,
	};
}

function repositoryFor(documents: QueryTotalRequestState[] = []) {
	const fixture = createCollection(documents);
	const repository = new RxQueryTotalRequestStateRepository({
		queryTotalRequestStates: fixture.collection,
	} as never);
	return { repository, ...fixture };
}

describe('RxQueryTotalRequestStateRepository', () => {
	it('upserts query total request state documents', async () => {
		const { repository, bulkUpsert } = repositoryFor();
		const next = state({ queryKey: 'orders:status=pending', ownerId: 'tab-b' });

		await repository.upsert(next);

		expect(bulkUpsert).toHaveBeenCalledWith([{ ...next, schemaVersion: 2 }]);
	});

	it('claim-inserts a new request state only when the query key is absent', async () => {
		const { repository, insert, stored } = repositoryFor();
		const next = state({ queryKey: 'orders:status=pending', ownerId: 'tab-b' });

		await expect(repository.claimNew(next)).resolves.toBe(true);

		expect(insert).toHaveBeenCalledWith({ ...next, schemaVersion: 2 });
		expect(stored.get('orders:status=pending')).toEqual({ ...next, schemaVersion: 2 });
	});

	it('does not overwrite an existing request state when claim-insert loses the primary-key race', async () => {
		const existing = state({ queryKey: 'orders:status=pending', ownerId: 'tab-a', attempt: 1 });
		const newerClaim = state({ queryKey: 'orders:status=pending', ownerId: 'tab-b', attempt: 1 });
		const { repository, stored } = repositoryFor([existing]);

		await expect(repository.claimNew(newerClaim)).resolves.toBe(false);

		expect(stored.get('orders:status=pending')).toEqual(existing);
	});

	it('reads requested query keys sorted by query key', async () => {
		const { repository } = repositoryFor([
			state({ queryKey: 'orders:z' }),
			state({ queryKey: 'orders:a' }),
			state({ queryKey: 'orders:m' }),
		]);

		await expect(repository.readForQueryKeys(['orders:z', 'orders:a'])).resolves.toEqual([
			expect.objectContaining({ queryKey: 'orders:a' }),
			expect.objectContaining({ queryKey: 'orders:z' }),
		]);
	});

	it('does not expose the persisted schema marker when reading request states', async () => {
		const { repository } = repositoryFor([
			{ ...state({ queryKey: 'orders:a' }), schemaVersion: 2 } as QueryTotalRequestState,
		]);

		await expect(repository.readForQueryKeys(['orders:a'])).resolves.toEqual([
			state({ queryKey: 'orders:a' }),
		]);
	});

	it('returns runnable expired owner and retry-ready states', async () => {
		const { repository } = repositoryFor([
			state({
				queryKey: 'active-owner',
				status: 'in-flight',
				claimedUntilMs: 2_000,
				retryAfterMs: null,
			}),
			state({
				queryKey: 'expired-owner',
				status: 'in-flight',
				claimedUntilMs: 1_000,
				retryAfterMs: null,
			}),
			state({
				queryKey: 'backoff-active',
				status: 'failed',
				ownerId: null,
				claimedUntilMs: null,
				retryAfterMs: 2_000,
			}),
			state({
				queryKey: 'retry-ready',
				status: 'failed',
				ownerId: null,
				claimedUntilMs: null,
				retryAfterMs: 1_000,
			}),
		]);

		await expect(repository.readRunnable(1_500)).resolves.toEqual([
			expect.objectContaining({ queryKey: 'expired-owner' }),
			expect.objectContaining({ queryKey: 'retry-ready' }),
		]);
	});

	it('preserves Woo request metadata when reading runnable states', async () => {
		const request = {
			queryKey: 'orders:browser:status=processing:limit=50',
			method: 'GET' as const,
			endpoint: '/wp-json/wc/v3/orders',
			params: { status: 'processing', page: 1, per_page: 1 },
			totalHeader: 'X-WP-Total' as const,
		};
		const { repository } = repositoryFor([
			state({
				queryKey: 'expired-owner',
				status: 'in-flight',
				claimedUntilMs: 1_000,
				retryAfterMs: null,
				request,
			}),
		]);

		await expect(repository.readRunnable(1_500)).resolves.toEqual([
			expect.objectContaining({ queryKey: 'expired-owner', request }),
		]);
	});

	it('removes existing request state documents with incremental deletion', async () => {
		const { repository, stored } = repositoryFor([state({ queryKey: 'orders:a' })]);

		await expect(repository.remove(state({ queryKey: 'orders:a' }))).resolves.toBe(true);

		expect(stored.has('orders:a')).toBe(false);
	});

	it('does not remove a newer state for the same query key', async () => {
		const older = state({
			queryKey: 'orders:a',
			ownerId: 'tab-a',
			attempt: 1,
			claimedUntilMs: 1_000,
			updatedAtMs: 1_000,
		});
		const newer = state({
			queryKey: 'orders:a',
			ownerId: 'tab-b',
			attempt: 2,
			claimedUntilMs: 2_000,
			updatedAtMs: 1_500,
		});
		const { repository, stored } = repositoryFor([newer]);

		await expect(repository.remove(older)).resolves.toBe(false);

		expect(stored.get('orders:a')).toEqual(newer);
	});

	it('claims a runnable request state only when the stored state still matches the expected state', async () => {
		const expired = state({
			queryKey: 'orders:a',
			ownerId: 'tab-a',
			attempt: 1,
			claimedUntilMs: 1_000,
			updatedAtMs: 1_000,
		});
		const claimed = state({
			...expired,
			ownerId: 'tab-b',
			attempt: 2,
			claimedUntilMs: 2_000,
			updatedAtMs: 1_500,
		});
		const { repository, stored } = repositoryFor([expired]);

		await expect(repository.claim(expired, claimed)).resolves.toBe(true);

		expect(stored.get('orders:a')).toEqual({ ...claimed, schemaVersion: 2 });
	});

	it('does not claim over a newer request owner attempt', async () => {
		const older = state({
			queryKey: 'orders:a',
			ownerId: 'tab-a',
			attempt: 1,
			claimedUntilMs: 1_000,
			updatedAtMs: 1_000,
		});
		const newer = state({
			queryKey: 'orders:a',
			ownerId: 'tab-c',
			attempt: 3,
			claimedUntilMs: 3_000,
			updatedAtMs: 2_000,
		});
		const claimedFromOlder = state({
			...older,
			ownerId: 'tab-b',
			attempt: 2,
			claimedUntilMs: 2_000,
			updatedAtMs: 1_500,
		});
		const { repository, stored } = repositoryFor([newer]);

		await expect(repository.claim(older, claimedFromOlder)).resolves.toBe(false);

		expect(stored.get('orders:a')).toEqual(newer);
	});

	it('marks a request failed only when the stored state still matches the owner attempt', async () => {
		const inFlight = state({
			queryKey: 'orders:a',
			ownerId: 'tab-a',
			attempt: 1,
			claimedUntilMs: 1_000,
			updatedAtMs: 1_000,
		});
		const failed = state({
			...inFlight,
			status: 'failed',
			ownerId: null,
			claimedUntilMs: null,
			retryAfterMs: 2_000,
			updatedAtMs: 1_500,
		});
		const { repository, stored } = repositoryFor([inFlight]);

		await expect(repository.markFailed(inFlight, failed)).resolves.toBe(true);

		expect(stored.get('orders:a')).toEqual({ ...failed, schemaVersion: 2 });
	});

	it('does not mark a newer request owner failed from an older owner attempt', async () => {
		const older = state({
			queryKey: 'orders:a',
			ownerId: 'tab-a',
			attempt: 1,
			claimedUntilMs: 1_000,
			updatedAtMs: 1_000,
		});
		const newer = state({
			queryKey: 'orders:a',
			ownerId: 'tab-b',
			attempt: 2,
			claimedUntilMs: 2_000,
			updatedAtMs: 1_500,
		});
		const failedOlder = state({
			...older,
			status: 'failed',
			ownerId: null,
			claimedUntilMs: null,
			retryAfterMs: 2_500,
			updatedAtMs: 2_000,
		});
		const { repository, stored } = repositoryFor([newer]);

		await expect(repository.markFailed(older, failedOlder)).resolves.toBe(false);

		expect(stored.get('orders:a')).toEqual(newer);
	});

	it('does not remove or mark failed state when request metadata differs', async () => {
		const storedRequest = {
			queryKey: 'orders:a',
			method: 'GET' as const,
			endpoint: '/wp-json/wc/v3/orders',
			params: { status: 'processing', page: 1, per_page: 1 },
			totalHeader: 'X-WP-Total' as const,
		};
		const expectedRequest = {
			...storedRequest,
			params: { status: 'completed', page: 1, per_page: 1 },
		};
		const storedState = state({ queryKey: 'orders:a', request: storedRequest });
		const expectedState = state({ queryKey: 'orders:a', request: expectedRequest });
		const failedState = state({
			...expectedState,
			status: 'failed',
			ownerId: null,
			claimedUntilMs: null,
			retryAfterMs: 2_000,
		});
		const { repository, stored } = repositoryFor([storedState]);

		await expect(repository.remove(expectedState)).resolves.toBe(false);
		await expect(repository.markFailed(expectedState, failedState)).resolves.toBe(false);

		expect(stored.get('orders:a')).toEqual(storedState);
	});

	it('treats missing request state removal as a no-op', async () => {
		const { repository } = repositoryFor();

		await expect(repository.remove(state({ queryKey: 'missing' }))).resolves.toBe(false);
	});
});
