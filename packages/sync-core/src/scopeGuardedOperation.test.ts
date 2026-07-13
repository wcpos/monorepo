/**
 * runScopeGuardedOperation against a REAL StoreScopeManager (stub databases).
 * This is the generic scope-guarded seam the playground's targeted product pull
 * and delete ride: one (scope, epoch) ticket — issued here or captured BEFORE a
 * enclosing runGuarded capture (the change-signal binding) — a bound scoped fetch for
 * the gather phase, and a single guardWrite for the commit, with the same
 * applied/dropped/stale/aborted/error classification as runScopeGuardedPull.
 */

import { describe, expect, it, vi } from 'vitest';

import { applyScopeGuardedWrite, runScopeGuardedOperation } from './scopeGuardedOperation';
import { type Fetcher, type ScopeDatabase, StoreScopeManager } from './storeScopeManager';

function stubDatabase(): ScopeDatabase {
	return {
		listCollections: () => ['products', 'orders', 'mutations'],
		resetCollection: async () => {},
		pendingMutationCount: async () => 0,
		close: async () => {},
	};
}

async function makeManager(): Promise<StoreScopeManager> {
	const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
	await manager.open('scope-a');
	await manager.open('scope-b');
	await manager.switchTo('scope-a');
	return manager;
}

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

describe('runScopeGuardedOperation', () => {
	it('applies a fetch-then-write operation: scoped gather, guarded commit, applied count', async () => {
		const manager = await makeManager();
		const written: number[][] = [];
		const fetcher: Fetcher = vi.fn(async () => jsonResponse([{ id: 1 }, { id: 2 }]));

		const result = await runScopeGuardedOperation({
			manager,
			fetcher,
			produce: async (scopedFetch) => {
				const response = await scopedFetch('http://woo.local/products?include=1,2');
				return (await response.json()) as { id: number }[];
			},
			commit: async (rows) => {
				written.push(rows.map((row) => row.id));
				return rows.length;
			},
		});

		expect(result).toEqual({ status: 'applied', applied: 2 });
		expect(written).toEqual([[1, 2]]);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(manager.stats().wrongScopeWrites).toBe(0);
	});

	it('applies a write-only operation (no fetcher/produce): the delete shape', async () => {
		const manager = await makeManager();
		let removed = 0;

		const result = await runScopeGuardedOperation({
			manager,
			commit: async () => {
				removed = 3;
				return removed;
			},
		});

		expect(result).toEqual({ status: 'applied', applied: 3 });
		expect(removed).toBe(3);
	});

	it('paginates: every produce request rides the SAME ticket, applied count sums the pages', async () => {
		const manager = await makeManager();
		const requested: string[] = [];
		const fetcher: Fetcher = async (url) => {
			requested.push(url);
			return jsonResponse([{ id: requested.length }]);
		};

		const result = await runScopeGuardedOperation({
			manager,
			fetcher,
			produce: async (scopedFetch) => {
				const rows: { id: number }[] = [];
				for (const page of ['a', 'b', 'c']) {
					const response = await scopedFetch(`http://woo.local/products?page=${page}`);
					rows.push(...((await response.json()) as { id: number }[]));
				}
				return rows;
			},
			commit: async (rows) => rows.length,
		});

		expect(result).toEqual({ status: 'applied', applied: 3 });
		expect(requested).toHaveLength(3);
	});

	it('spans pagination on ONE ticket: a switch between pages refuses the later page', async () => {
		const manager = await makeManager();
		const requested: string[] = [];
		const fetcher: Fetcher = async (url) => {
			requested.push(url);
			return jsonResponse([{ id: requested.length }]);
		};

		const result = await runScopeGuardedOperation({
			manager,
			fetcher,
			produce: async (scopedFetch) => {
				const rows: { id: number }[] = [];
				// Page 1 completes while the ticket is current...
				const first = await scopedFetch('http://woo.local/products?page=a');
				rows.push(...((await first.json()) as { id: number }[]));
				// ...then the scope switches, staling the ONE captured ticket every page rides...
				await manager.switchTo('scope-b');
				// ...so page 2 must refuse to start network work (the cross-scope-write bug
				// for paginated backlogs, guarded).
				const second = await scopedFetch('http://woo.local/products?page=b');
				rows.push(...((await second.json()) as { id: number }[]));
				return rows;
			},
			commit: async (rows) => rows.length,
		});

		expect(result.status).toBe('aborted');
		expect(result.applied).toBe(0);
		expect(requested).toEqual(['http://woo.local/products?page=a']); // page 2 never fired
	});

	it('surfaces a wiring mistake: produce that fetches with no fetcher supplied is an error', async () => {
		const manager = await makeManager();

		const result = await runScopeGuardedOperation({
			manager,
			// No fetcher, yet produce reaches for the scoped fetch — the throwing stub
			// must surface loudly rather than silently no-op.
			produce: async (scopedFetch) => scopedFetch('http://woo.local/products'),
			commit: async () => 1,
		});

		expect(result.status).toBe('error');
		expect(result.detail).toMatch(/no fetcher was supplied/);
	});

	it('honors an ENCLOSING bound: a write under a capture whose scope has switched away drops', async () => {
		const manager = await makeManager();
		// The change-signal binding: the tick captures ONE bound, awaits (poll),
		// and the scope switches during the await. Routing the operation through
		// that bound must DROP the write — proof the passed capture (not a fresh,
		// now-current one) is the one that is guarded.
		let committed = false;
		const result = await manager.runGuarded(async (bound) => {
			await manager.switchTo('scope-b');
			return runScopeGuardedOperation({
				manager,
				bound,
				commit: async () => {
					committed = true;
					return 5;
				},
			});
		});

		expect(result).toEqual({ status: 'dropped', applied: 0 });
		expect(committed).toBe(false); // guardWrite refuses the write under a stale capture
		expect(manager.stats().wrongScopeWrites).toBe(1);
	});

	it('drops the write when the scope switches during the produce phase', async () => {
		const manager = await makeManager();
		let committed = false;

		const result = await runScopeGuardedOperation({
			manager,
			produce: async () => {
				// A switch landing while the payload is being gathered stales the ticket
				// issued at call time, so the commit below drops.
				await manager.switchTo('scope-b');
				return ['x'];
			},
			commit: async (rows) => {
				committed = true;
				return rows.length;
			},
		});

		expect(result).toEqual({ status: 'dropped', applied: 0 });
		expect(committed).toBe(false);
	});

	it('refuses network work and aborts when the enclosing capture already moved on (fetcher never called)', async () => {
		const manager = await makeManager();
		const fetcher = vi.fn<Fetcher>(async () => jsonResponse([]));

		const result = await manager.runGuarded(async (bound) => {
			await manager.switchTo('scope-b');
			return runScopeGuardedOperation({
				manager,
				bound,
				fetcher,
				produce: async (scopedFetch) => scopedFetch('http://woo.local/products'),
				commit: async () => 1,
			});
		});

		expect(result.status).toBe('aborted');
		expect(result.applied).toBe(0);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('classifies a late response after a mid-flight switch as stale, write never invoked', async () => {
		const manager = await makeManager();
		let committed = false;
		let release!: (response: Response) => void;
		const fetcher: Fetcher = () =>
			new Promise<Response>((resolve) => {
				release = resolve;
			});

		const racing = runScopeGuardedOperation({
			manager,
			fetcher,
			produce: async (scopedFetch) => scopedFetch('http://woo.local/products'),
			commit: async () => {
				committed = true;
				return 1;
			},
		});
		await Promise.resolve();
		await manager.switchTo('scope-b');
		release(jsonResponse([{ id: 1 }]));
		const result = await racing;

		expect(result.status).toBe('stale');
		expect(result.detail).toContain('ScopeStaleError');
		expect(committed).toBe(false);
		expect(manager.stats().lateResponsesDropped).toBe(1);
	});

	it('classifies an in-flight abort as aborted, write never invoked', async () => {
		const manager = await makeManager();
		let committed = false;
		let fetchStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			fetchStarted = resolve;
		});
		const fetcher: Fetcher = (_url, init) =>
			new Promise<Response>((_resolve, reject) => {
				fetchStarted();
				init?.signal?.addEventListener('abort', () =>
					reject(new DOMException('aborted', 'AbortError'))
				);
			});

		const racing = runScopeGuardedOperation({
			manager,
			fetcher,
			produce: async (scopedFetch) => scopedFetch('http://woo.local/products'),
			commit: async () => {
				committed = true;
				return 1;
			},
		});
		await started;
		await manager.switchTo('scope-b');
		const result = await racing;

		expect(result.status).toBe('aborted');
		expect(result.applied).toBe(0);
		expect(committed).toBe(false);
	});

	it("classifies a DOMException-like plain object {name:'AbortError'} as aborted", async () => {
		const manager = await makeManager();
		const fetcher: Fetcher = async () => {
			throw { name: 'AbortError' };
		};

		const result = await runScopeGuardedOperation({
			manager,
			fetcher,
			produce: async (scopedFetch) => scopedFetch('http://woo.local/products'),
			commit: async () => 1,
		});

		expect(result.status).toBe('aborted');
	});

	it('classifies a produce throw (e.g. an HTTP error) as error with detail', async () => {
		const manager = await makeManager();
		const fetcher: Fetcher = async () => new Response('nope', { status: 500 });

		const result = await runScopeGuardedOperation({
			manager,
			fetcher,
			produce: async (scopedFetch) => {
				const response = await scopedFetch('http://woo.local/products');
				if (!response.ok) {
					throw new Error(`targeted product pull failed: ${response.status}`);
				}
				return response;
			},
			commit: async () => 1,
		});

		expect(result.status).toBe('error');
		expect(result.applied).toBe(0);
		expect(result.detail).toContain('targeted product pull failed: 500');
	});

	it('classifies a commit throw as error (consistent with the pull seam, not a thrown rejection)', async () => {
		const manager = await makeManager();

		const result = await runScopeGuardedOperation({
			manager,
			commit: async () => {
				throw new Error('product bulkUpsert failed for 1 document(s)');
			},
		});

		expect(result.status).toBe('error');
		expect(result.applied).toBe(0);
		expect(result.detail).toContain('bulkUpsert failed');
	});
});

describe('applyScopeGuardedWrite', () => {
	it('a write-back racing a switch is dropped, counted as wrongScopeWrites, and thrown as an abort', async () => {
		const manager = await makeManager(); // scope-a active

		let wrote = false;
		await manager.runGuarded(async (bound) => {
			// bound captured at drain start under scope-a…
			await manager.switchTo('scope-b'); // …and the swap lands mid-drain
			await expect(
				applyScopeGuardedWrite({
					bound,
					label: 'write-drain reconcile (orders)',
					write: async () => {
						wrote = true;
					},
				})
			).rejects.toMatchObject({ name: 'AbortError' });
		});
		expect(wrote).toBe(false);
		expect(manager.stats().wrongScopeWrites).toBe(1);
	});

	it('applies the write under a still-current capture', async () => {
		const manager = await makeManager();

		let wrote = false;
		await manager.runGuarded(async (bound) => {
			await applyScopeGuardedWrite({
				bound,
				label: 'write-drain reconcile (orders)',
				write: async () => {
					wrote = true;
				},
			});
		});
		expect(wrote).toBe(true);
		expect(manager.stats().wrongScopeWrites).toBe(0);
	});
});
