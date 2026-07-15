import { describe, expect, it, vi } from 'vitest';

import {
	type Fetcher,
	MUTATION_QUEUE_COLLECTION,
	type ScopeDatabase,
	type ScopeEvent,
	type ScopeId,
	ScopeStaleError,
	StoreScopeManager,
} from './storeScopeManager';

type FakeDatabase = {
	database: ScopeDatabase;
	resetCalls: string[];
	close: ReturnType<typeof vi.fn>;
	pendingMutationCount: ReturnType<typeof vi.fn>;
};

function makeFakeDatabase(input?: {
	collections?: string[];
	pendingMutations?: number;
}): FakeDatabase {
	const resetCalls: string[] = [];
	const close = vi.fn(async () => {});
	const pendingMutationCount = vi.fn(async () => input?.pendingMutations ?? 0);
	const database: ScopeDatabase = {
		listCollections: () => input?.collections ?? ['products', 'orders', MUTATION_QUEUE_COLLECTION],
		resetCollection: async (name: string) => {
			resetCalls.push(name);
		},
		pendingMutationCount,
		close,
	};
	return { database, resetCalls, close, pendingMutationCount };
}

/** Drain pending microtasks without timers (the manager itself has none). */
async function flushMicrotasks(): Promise<void> {
	for (let i = 0; i < 10; i += 1) {
		await Promise.resolve();
	}
}

function makeManager(options?: {
	perScope?: (scopeId: ScopeId) => { collections?: string[]; pendingMutations?: number };
}) {
	const fakes = new Map<ScopeId, FakeDatabase>();
	const createDatabase = vi.fn(async (scopeId: ScopeId) => {
		const fake = makeFakeDatabase(options?.perScope?.(scopeId));
		fakes.set(scopeId, fake);
		return fake.database;
	});
	const manager = new StoreScopeManager({ createDatabase, now: () => 0 });
	const events: ScopeEvent[] = [];
	manager.onEvent((event) => events.push(event));
	return { manager, createDatabase, fakes, events };
}

describe('StoreScopeManager', () => {
	describe('store switching', () => {
		it('pauses the outgoing scope without tearing it down: db stays open and cached', async () => {
			const { manager, createDatabase, fakes } = makeManager();
			await manager.switchTo('site1:cashier1:store1');
			await manager.switchTo('site1:cashier1:store2');

			expect(fakes.get('site1:cashier1:store1')!.close).not.toHaveBeenCalled();
			expect(fakes.get('site1:cashier1:store2')!.close).not.toHaveBeenCalled();
			expect(manager.stats().scopesOpen).toBe(2);

			// Switching back reuses the cached database — no re-create.
			await manager.switchTo('site1:cashier1:store1');
			expect(createDatabase).toHaveBeenCalledTimes(2);
			expect(manager.activeScope).toBe('site1:cashier1:store1');
		});

		it('bumps the global epoch on every switch and emits a switched event', async () => {
			const { manager, events } = makeManager();
			expect(manager.epoch).toBe(0);
			const first = await manager.switchTo('scope-a');
			const second = await manager.switchTo('scope-b');

			expect(first).toEqual({ scopeId: 'scope-a', epoch: 1 });
			expect(second).toEqual({ scopeId: 'scope-b', epoch: 2 });
			expect(events.map((event) => [event.type, event.scopeId, event.epoch])).toEqual([
				['switched', 'scope-a', 1],
				['switched', 'scope-b', 2],
			]);
		});

		it('treats switching to the already-active scope as a no-op', async () => {
			const { manager, events } = makeManager();
			await manager.switchTo('scope-a');
			const repeat = await manager.switchTo('scope-a');

			expect(repeat).toEqual({ scopeId: 'scope-a', epoch: 1 });
			expect(manager.epoch).toBe(1);
			expect(events.filter((event) => event.type === 'switched')).toHaveLength(1);
		});

		it('serializes concurrent switchTo calls so they cannot interleave', async () => {
			const deferred = new Map<ScopeId, (database: ScopeDatabase) => void>();
			const createDatabase = vi.fn(
				(scopeId: ScopeId) =>
					new Promise<ScopeDatabase>((resolve) => {
						deferred.set(scopeId, resolve);
					})
			);
			const manager = new StoreScopeManager({ createDatabase });
			const events: ScopeEvent[] = [];
			manager.onEvent((event) => events.push(event));

			const switchA = manager.switchTo('scope-a');
			const switchB = manager.switchTo('scope-b');
			await flushMicrotasks();

			// The second switch must not even start opening until the first commits.
			expect(createDatabase.mock.calls.map(([scopeId]) => scopeId)).toEqual(['scope-a']);

			deferred.get('scope-a')!(makeFakeDatabase().database);
			await expect(switchA).resolves.toEqual({ scopeId: 'scope-a', epoch: 1 });

			// Now — and only now — the second switch proceeds.
			await flushMicrotasks();
			expect(createDatabase.mock.calls.map(([scopeId]) => scopeId)).toEqual(['scope-a', 'scope-b']);
			deferred.get('scope-b')!(makeFakeDatabase().database);
			await expect(switchB).resolves.toEqual({ scopeId: 'scope-b', epoch: 2 });

			expect(manager.activeScope).toBe('scope-b');
			expect(events.map((event) => [event.type, event.scopeId, event.epoch])).toEqual([
				['switched', 'scope-a', 1],
				['switched', 'scope-b', 2],
			]);
		});

		it('works offline: switching never involves any fetcher', async () => {
			const fetcher = vi.fn<Fetcher>();
			const { manager } = makeManager();
			await manager.open('scope-a');
			await manager.switchTo('scope-a');
			await manager.switchTo('scope-b');
			await manager.switchTo('scope-a');

			expect(fetcher).not.toHaveBeenCalled();
			expect(manager.stats().scopesOpen).toBe(2);
		});
	});

	describe('runGuarded: epoch-tagged write guarding', () => {
		it('applies a write while the capture matches the current (scope, epoch)', async () => {
			const { manager } = makeManager();
			await manager.switchTo('scope-a');
			const write = vi.fn(async () => {});

			await manager.runGuarded(async (bound) => {
				await expect(bound.guardWrite(write)).resolves.toBe('applied');
			});
			expect(write).toHaveBeenCalledTimes(1);
			expect(manager.stats().wrongScopeWrites).toBe(0);
		});

		it('drops, counts, and events a write whose capture predates a switch', async () => {
			const { manager, events } = makeManager();
			await manager.switchTo('scope-a');
			const write = vi.fn(async () => {});

			await manager.runGuarded(async (bound) => {
				await manager.switchTo('scope-b');
				await expect(bound.guardWrite(write)).resolves.toBe('dropped');
			});
			expect(write).not.toHaveBeenCalled();
			expect(manager.stats().wrongScopeWrites).toBe(1);

			const dropped = events.filter((event) => event.type === 'write-dropped');
			expect(dropped).toHaveLength(1);
			expect(dropped[0]).toMatchObject({ scopeId: 'scope-a', epoch: 1 });
		});

		it('captures at call time: a switch during an await mid-operation drops every later effect (the poll shape)', async () => {
			// The change-signal shape: capture, then a read-only await (engine.poll()),
			// then writes. A switch landing during the await must leave the writes
			// pinned to the CAPTURED scope — dropped — not the newly-active one.
			const { manager } = makeManager();
			await manager.switchTo('scope-a');
			const write = vi.fn(async () => {});
			const fetcher = vi.fn<Fetcher>(async () => ({ ok: true }) as Response);

			await manager.runGuarded(async (bound) => {
				expect(bound.scopeId).toBe('scope-a');
				// Simulated poll: an await the caller does not control.
				await Promise.resolve();
				await manager.switchTo('scope-b');
				expect(bound.isCurrent()).toBe(false);
				await expect(bound.guardWrite(write)).resolves.toBe('dropped');
				await expect(bound.bindFetch(fetcher)('https://store.example/x')).rejects.toMatchObject({
					name: 'AbortError',
				});
			});
			expect(write).not.toHaveBeenCalled();
			expect(fetcher).not.toHaveBeenCalled();
			expect(manager.stats().wrongScopeWrites).toBe(1);
		});

		it('invalidates the outgoing capture on switch; a fresh capture on the new scope is live', async () => {
			const { manager } = makeManager();
			await manager.switchTo('scope-a');
			await manager.runGuarded(async (bound) => {
				expect(bound.isCurrent()).toBe(true);
				await manager.switchTo('scope-b');
				expect(bound.isCurrent()).toBe(false);
			});
			await manager.runGuarded(async (bound) => {
				expect(bound.isCurrent()).toBe(true);
				expect(bound.scopeId).toBe('scope-b');
			});
		});

		it('refuses to run a guarded operation with no active scope', () => {
			const { manager } = makeManager();
			expect(() => manager.runGuarded(async () => {})).toThrow(/no active scope/);
		});
	});

	describe('ScopeBound.bindFetch', () => {
		it('delegates to the raw fetcher and returns its response while the capture is current', async () => {
			const { manager } = makeManager();
			await manager.switchTo('scope-a');
			const response = { ok: true } as Response;
			const fetcher = vi.fn<Fetcher>(async () => response);

			await manager.runGuarded(async (bound) => {
				await expect(bound.bindFetch(fetcher)('https://store.example/anything')).resolves.toBe(
					response
				);
			});
			expect(fetcher).toHaveBeenCalledTimes(1);
			expect(manager.stats().lateResponsesDropped).toBe(0);
		});

		it('aborts the in-flight request signal when the scope is switched away', async () => {
			const { manager } = makeManager();
			await manager.switchTo('scope-a');

			let observedSignal: AbortSignal | undefined;
			const fetcher: Fetcher = (_url, init) =>
				new Promise<Response>((_resolve, reject) => {
					observedSignal = init?.signal;
					init?.signal?.addEventListener('abort', () =>
						reject(new DOMException('aborted', 'AbortError'))
					);
				});

			await manager.runGuarded(async (bound) => {
				const pending = bound.bindFetch(fetcher)(
					'https://store.example/wp-json/wcpos/v2/orders/pull'
				);
				await manager.switchTo('scope-b');
				expect(observedSignal?.aborted).toBe(true);
				await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
			});
			// An aborted request never landed — it is not a late response.
			expect(manager.stats().lateResponsesDropped).toBe(0);
		});

		it('drops a late non-aborted response via ScopeStaleError after emitting late-response-dropped', async () => {
			const { manager, events } = makeManager();
			await manager.switchTo('scope-a');

			let release!: (response: Response) => void;
			const ignoresAbort: Fetcher = () =>
				new Promise<Response>((resolve) => {
					release = resolve;
				});

			await manager.runGuarded(async (bound) => {
				const pending = bound.bindFetch(ignoresAbort)(
					'https://store.example/wp-json/wcpos/v2/orders/pull'
				);
				await manager.switchTo('scope-b');
				release({ ok: true } as Response);

				const error = await pending.then(
					() => {
						throw new Error('expected ScopeStaleError');
					},
					(caught: unknown) => caught
				);
				expect(error).toBeInstanceOf(ScopeStaleError);
				const stale = error as ScopeStaleError;
				expect(stale.scopeId).toBe('scope-a');
				expect(stale.epoch).toBe(1);
				expect(stale.currentEpoch).toBe(2);
			});

			expect(manager.stats().lateResponsesDropped).toBe(1);
			const dropped = events.filter((event) => event.type === 'late-response-dropped');
			expect(dropped).toHaveLength(1);
			expect(dropped[0]).toMatchObject({ scopeId: 'scope-a', epoch: 1 });
		});

		it("refuses network work (no fetch) once the capture's scope has moved on", async () => {
			const { manager } = makeManager();
			await manager.switchTo('scope-a');
			const fetcher = vi.fn<Fetcher>(async () => ({ ok: true }) as Response);

			await manager.runGuarded(async (bound) => {
				// The scope switches AFTER capture. Every request through the bound
				// fetcher must refuse to start network work, classified as an
				// AbortError, rather than burn a request against a scope the capture
				// no longer owns.
				await manager.switchTo('scope-b');
				await expect(
					bound.bindFetch(fetcher)('https://store.example/anything')
				).rejects.toMatchObject({
					name: 'AbortError',
				});
			});
			expect(fetcher).not.toHaveBeenCalled();
		});

		it('refuses network work when the captured signal is already aborted (same-scope reset)', async () => {
			const { manager } = makeManager();
			await manager.switchTo('scope-a');
			const fetcher = vi.fn<Fetcher>(async () => ({ ok: true }) as Response);

			await manager.runGuarded(async (bound) => {
				// Reset the active scope's collection: bumps the epoch AND aborts the
				// scope's controller, so the captured signal fires even though the
				// scope id is unchanged. The pre-check must catch the aborted signal.
				await manager.resetCollection('scope-a', 'orders');
				await expect(
					bound.bindFetch(fetcher)('https://store.example/anything')
				).rejects.toMatchObject({
					name: 'AbortError',
				});
			});
			expect(fetcher).not.toHaveBeenCalled();
		});
	});

	describe('collection reset', () => {
		it('stops feeders, drops, and emits exactly one reset event — in order, with no sleeps', async () => {
			const order: string[] = [];
			const fakes = new Map<ScopeId, FakeDatabase>();
			const manager = new StoreScopeManager({
				createDatabase: async (scopeId) => {
					const fake = makeFakeDatabase();
					fakes.set(scopeId, fake);
					return {
						...fake.database,
						resetCollection: async (name: string) => {
							order.push(`drop:${name}`);
						},
					};
				},
			});
			const resetEvents: ScopeEvent[] = [];
			manager.onEvent((event) => {
				if (event.type === 'reset') {
					resetEvents.push(event);
					order.push(`event:${event.detail}`);
				}
			});
			await manager.switchTo('scope-a');
			manager.registerSubscription('scope-a', () => order.push('teardown'));

			const epochBefore = manager.epoch;
			await manager.runGuarded(async (boundBeforeReset) => {
				await expect(manager.resetCollection('scope-a', 'products')).resolves.toBe('reset');

				// Deterministic ordering: feeders stop, then drop/recreate, then ONE event.
				expect(order).toEqual(['teardown', 'drop:products', 'event:products']);
				expect(resetEvents).toHaveLength(1);
				expect(resetEvents[0]).toMatchObject({
					type: 'reset',
					scopeId: 'scope-a',
					epoch: epochBefore + 1,
				});
				expect(manager.epoch).toBe(epochBefore + 1);
				// In-flight work from before the reset is stale and its writes drop.
				expect(boundBeforeReset.isCurrent()).toBe(false);
				await expect(boundBeforeReset.guardWrite(async () => {})).resolves.toBe('dropped');
			});
			expect(manager.stats().activeSubscriptions).toBe(0);
		});

		it('returns needs-confirmation for the mutation queue with pending mutations, without touching the db', async () => {
			const { manager, fakes, events } = makeManager({
				perScope: () => ({ pendingMutations: 3 }),
			});
			await manager.switchTo('scope-a');
			const epochBefore = manager.epoch;
			const teardown = vi.fn();
			manager.registerSubscription('scope-a', teardown);

			await expect(manager.resetCollection('scope-a', MUTATION_QUEUE_COLLECTION)).resolves.toBe(
				'needs-confirmation'
			);

			const fake = fakes.get('scope-a')!;
			expect(fake.resetCalls).toEqual([]);
			expect(teardown).not.toHaveBeenCalled();
			expect(manager.epoch).toBe(epochBefore);
			const confirmations = events.filter((event) => event.type === 'needs-confirmation');
			expect(confirmations).toHaveLength(1);
			expect(confirmations[0]).toMatchObject({ scopeId: 'scope-a', epoch: epochBefore });
		});

		it('resets the mutation queue when explicitly confirmed', async () => {
			const { manager, fakes, events } = makeManager({
				perScope: () => ({ pendingMutations: 3 }),
			});
			await manager.switchTo('scope-a');

			await expect(
				manager.resetCollection('scope-a', MUTATION_QUEUE_COLLECTION, { confirmDestroyQueue: true })
			).resolves.toBe('reset');

			expect(fakes.get('scope-a')!.resetCalls).toEqual([MUTATION_QUEUE_COLLECTION]);
			expect(events.filter((event) => event.type === 'reset')).toHaveLength(1);
			expect(events.filter((event) => event.type === 'needs-confirmation')).toHaveLength(0);
		});

		it('resets a data collection without confirmation even with pending mutations — queue untouched', async () => {
			const { manager, fakes } = makeManager({
				perScope: () => ({ pendingMutations: 5 }),
			});
			await manager.switchTo('scope-a');

			await expect(manager.resetCollection('scope-a', 'products')).resolves.toBe('reset');

			const fake = fakes.get('scope-a')!;
			expect(fake.resetCalls).toEqual(['products']);
			expect(fake.resetCalls).not.toContain(MUTATION_QUEUE_COLLECTION);
			// The data-collection path never even consults the queue.
			expect(fake.pendingMutationCount).not.toHaveBeenCalled();
		});

		it('resets an inactive scope without disturbing the active one', async () => {
			const { manager, fakes } = makeManager();
			await manager.switchTo('scope-a');
			await manager.switchTo('scope-b');

			await manager.runGuarded(async (bound) => {
				let observedSignal: AbortSignal | undefined;
				let release!: (response: Response) => void;
				const hung: Fetcher = (_url, init) =>
					new Promise<Response>((resolve) => {
						observedSignal = init?.signal;
						release = resolve;
					});
				const pending = bound.bindFetch(hung)('https://store.example/orders/pull');

				await expect(manager.resetCollection('scope-a', 'orders')).resolves.toBe('reset');

				expect(fakes.get('scope-a')!.resetCalls).toEqual(['orders']);
				// Reset of scope-a aborts scope-a's in-flight work, not scope-b's signal…
				expect(observedSignal?.aborted).toBe(false);
				// …but the global epoch moved, so pre-reset captures are stale everywhere.
				await expect(bound.guardWrite(async () => {})).resolves.toBe('dropped');
				release({ ok: true } as Response);
				await expect(pending).rejects.toBeInstanceOf(ScopeStaleError);
			});
		});

		it('rejects resets for unopened scopes and unknown collections', async () => {
			const { manager } = makeManager();
			await expect(manager.resetCollection('never-opened', 'products')).rejects.toThrow(/not open/);
			await manager.switchTo('scope-a');
			await expect(manager.resetCollection('scope-a', 'nonsense')).rejects.toThrow(
				/unknown collection/
			);
		});
	});

	describe('cursor invalidation on collection reset', () => {
		it('runs the matching invalidator inside the reset — after feeders stop, BEFORE the drop', async () => {
			const order: string[] = [];
			const manager = new StoreScopeManager({
				createDatabase: async () => ({
					listCollections: () => ['products', 'orders'],
					resetCollection: async (name: string) => {
						order.push(`drop:${name}`);
					},
					pendingMutationCount: async () => 0,
					close: async () => {},
				}),
			});
			manager.onEvent((event) => {
				if (event.type === 'reset') order.push(`event:${event.detail}`);
			});
			await manager.switchTo('scope-a');
			manager.registerCursorInvalidator('products', async (scopeId) => {
				order.push(`invalidate:${scopeId}`);
			});

			await expect(manager.resetCollection('scope-a', 'products')).resolves.toBe('reset');

			expect(order).toEqual(['invalidate:scope-a', 'drop:products', 'event:products']);
		});

		it("only the reset collection's invalidators run — another collection's cursor survives", async () => {
			const { manager } = makeManager();
			await manager.switchTo('scope-a');
			const products = vi.fn();
			const orders = vi.fn();
			manager.registerCursorInvalidator('products', products);
			manager.registerCursorInvalidator('orders', orders);

			await manager.resetCollection('scope-a', 'orders');

			expect(orders).toHaveBeenCalledTimes(1);
			expect(orders).toHaveBeenCalledWith('scope-a');
			expect(products).not.toHaveBeenCalled();
		});

		it('a store switch never invalidates — cursors survive pause/resume', async () => {
			const { manager } = makeManager();
			await manager.switchTo('scope-a');
			const invalidate = vi.fn();
			manager.registerCursorInvalidator('products', invalidate);

			await manager.switchTo('scope-b');
			await manager.switchTo('scope-a');

			expect(invalidate).not.toHaveBeenCalled();
		});

		it('a throwing invalidator aborts the reset with the collection intact: no drop, no event, feeders alive', async () => {
			const { manager, fakes, events } = makeManager();
			await manager.switchTo('scope-a');
			const teardown = vi.fn();
			manager.registerSubscription('scope-a', teardown);
			manager.registerCursorInvalidator('products', async () => {
				throw new Error('cursor store unavailable');
			});

			await expect(manager.resetCollection('scope-a', 'products')).rejects.toThrow(
				/cursor store unavailable/
			);

			// Collection intact, no reset event — a zeroed cursor over intact data
			// merely re-pulls; the stale-cursor-over-empty state is unrepresentable.
			expect(fakes.get('scope-a')!.resetCalls).toEqual([]);
			expect(events.filter((event) => event.type === 'reset')).toHaveLength(0);
			// Subscriptions were NOT torn down: nothing dropped, nothing to resubscribe.
			expect(teardown).not.toHaveBeenCalled();
			expect(manager.stats().activeSubscriptions).toBe(1);
		});

		it('invalidators run after the epoch bump + drain: a pre-reset capture cannot re-persist a stale cursor', async () => {
			const { manager } = makeManager();
			await manager.switchTo('scope-a');
			let cursor = 41;

			// A tick captured BEFORE the reset tries to persist a cursor advance in
			// the invalidator window (i.e. after the reset began). The epoch already
			// bumped and guarded writes drained, so the write must drop — nothing
			// can undo the rewind.
			await manager.runGuarded(async (bound) => {
				let writeOutcome: 'applied' | 'dropped' | null = null;
				manager.registerCursorInvalidator('products', async () => {
					cursor = 0;
					writeOutcome = await bound.guardWrite(async () => {
						cursor = 42;
					});
				});
				await manager.resetCollection('scope-a', 'products');
				expect(writeOutcome).toBe('dropped');
			});
			expect(cursor).toBe(0);
		});

		it('a FRESH capture inside the reset window is stale by construction — its writes drop, its fetches refuse', async () => {
			// The direct-manager hazard: after the epoch bump, a racing tick's fresh
			// capture holds the CURRENT epoch. Without the mutating-scope guard it
			// could advance the just-rewound cursor between the invalidator and the
			// drop, leaving a stale cursor over an empty replica. It must drop.
			const { manager } = makeManager();
			await manager.switchTo('scope-a');
			let cursor = 0;
			const fetcher = vi.fn<Fetcher>(async () => ({ ok: true }) as Response);
			let windowWrite: 'applied' | 'dropped' | null = null;
			let windowFetchRefused = false;
			manager.registerCursorInvalidator('products', async () => {
				// A tick racing the reset: captured DURING the window (current epoch).
				await manager.runGuarded(async (bound) => {
					expect(bound.isCurrent()).toBe(false);
					windowWrite = await bound.guardWrite(async () => {
						cursor = 99;
					});
					await bound
						.bindFetch(fetcher)('https://store.example/pull')
						.catch((error: unknown) => {
							windowFetchRefused = (error as Error).name === 'AbortError';
						});
				});
			});

			await expect(manager.resetCollection('scope-a', 'products')).resolves.toBe('reset');

			expect(windowWrite).toBe('dropped');
			expect(windowFetchRefused).toBe(true);
			expect(fetcher).not.toHaveBeenCalled();
			expect(cursor).toBe(0);
			// The window closed with the reset: fresh captures are current again.
			await manager.runGuarded(async (bound) => {
				expect(bound.isCurrent()).toBe(true);
				await expect(bound.guardWrite(async () => {})).resolves.toBe('applied');
			});
		});

		it('a needs-confirmation mutation-queue reset runs no invalidators', async () => {
			const { manager } = makeManager({ perScope: () => ({ pendingMutations: 2 }) });
			await manager.switchTo('scope-a');
			const invalidate = vi.fn();
			manager.registerCursorInvalidator(MUTATION_QUEUE_COLLECTION, invalidate);

			await expect(manager.resetCollection('scope-a', MUTATION_QUEUE_COLLECTION)).resolves.toBe(
				'needs-confirmation'
			);
			expect(invalidate).not.toHaveBeenCalled();
		});

		it('unregister is idempotent and stops future invalidation', async () => {
			const { manager } = makeManager();
			await manager.switchTo('scope-a');
			const invalidate = vi.fn();
			const unregister = manager.registerCursorInvalidator('products', invalidate);
			unregister();
			unregister();

			await manager.resetCollection('scope-a', 'products');
			expect(invalidate).not.toHaveBeenCalled();
		});
	});

	describe('subscriptions and closeScope', () => {
		it('keeps subscriptions registered across a switch (pause, not teardown)', async () => {
			const { manager } = makeManager();
			await manager.switchTo('scope-a');
			const teardown = vi.fn();
			manager.registerSubscription('scope-a', teardown);

			await manager.switchTo('scope-b');

			expect(teardown).not.toHaveBeenCalled();
			expect(manager.stats().activeSubscriptions).toBe(1);
		});

		it('unsubscribe runs the teardown once and is idempotent', async () => {
			const { manager } = makeManager();
			await manager.open('scope-a');
			const teardown = vi.fn();
			const subscription = manager.registerSubscription('scope-a', teardown);

			subscription.unsubscribe();
			subscription.unsubscribe();

			expect(teardown).toHaveBeenCalledTimes(1);
			expect(manager.stats().activeSubscriptions).toBe(0);
		});

		it('closeScope aborts in-flight work, clears teardowns, and actually closes the database', async () => {
			const { manager, fakes } = makeManager();
			await manager.switchTo('scope-a');
			const teardown = vi.fn();
			manager.registerSubscription('scope-a', teardown);

			await manager.runGuarded(async (bound) => {
				let observedSignal: AbortSignal | undefined;
				const hung: Fetcher = (_url, init) =>
					new Promise<Response>((_resolve, reject) => {
						observedSignal = init?.signal;
						init?.signal?.addEventListener('abort', () =>
							reject(new DOMException('aborted', 'AbortError'))
						);
					});
				const pending = bound.bindFetch(hung)('https://store.example/anything');

				await manager.closeScope('scope-a');

				expect(observedSignal?.aborted).toBe(true);
				await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
				expect(bound.isCurrent()).toBe(false);
			});

			expect(fakes.get('scope-a')!.close).toHaveBeenCalledTimes(1);
			expect(teardown).toHaveBeenCalledTimes(1);
			expect(manager.activeScope).toBeNull();
			expect(manager.stats().scopesOpen).toBe(0);
			expect(manager.stats().activeSubscriptions).toBe(0);
		});
	});

	describe('stats', () => {
		it('reports drops, subscriptions, epoch, and open scopes accurately', async () => {
			const { manager } = makeManager();
			await manager.switchTo('scope-a');
			manager.registerSubscription('scope-a', () => {});
			manager.registerSubscription('scope-a', () => {});

			await manager.runGuarded(async (staleBound) => {
				await manager.switchTo('scope-b');
				manager.registerSubscription('scope-b', () => {});
				await staleBound.guardWrite(async () => {});
			});

			await manager.runGuarded(async (bound) => {
				let releaseLate!: (response: Response) => void;
				const late = bound.bindFetch(
					() =>
						new Promise<Response>((resolve) => {
							releaseLate = resolve;
						})
				)('https://store.example/late');
				await manager.switchTo('scope-a');
				releaseLate({ ok: true } as Response);
				await expect(late).rejects.toBeInstanceOf(ScopeStaleError);
			});

			expect(manager.stats()).toEqual({
				wrongScopeWrites: 1,
				lateResponsesDropped: 1,
				activeSubscriptions: 3,
				epoch: 3,
				scopesOpen: 2,
			});
		});
	});
});

describe('in-flight guarded writes vs lifecycle ops (TOCTOU)', () => {
	it('resetCollection waits for a guarded write that already passed the check', async () => {
		const order: string[] = [];
		let releaseWrite: () => void = () => {};
		const db = {
			listCollections: () => ['orders', 'mutations'],
			resetCollection: async (name: string) => {
				order.push(`drop:${name}`);
			},
			pendingMutationCount: async () => 0,
			close: async () => {},
		};
		const manager = new StoreScopeManager({ createDatabase: async () => db });
		await manager.switchTo('scope-a');
		let writePromise!: Promise<'applied' | 'dropped'>;
		await manager.runGuarded(async (bound) => {
			writePromise = bound.guardWrite(
				() =>
					new Promise<void>((resolve) => {
						releaseWrite = () => {
							order.push('write-finished');
							resolve();
						};
						order.push('write-started');
					})
			);
		});

		const resetPromise = manager.resetCollection('scope-a', 'orders');
		// Give reset a chance to (wrongly) run ahead, then release the write.
		await Promise.resolve();
		releaseWrite();
		await Promise.all([writePromise, resetPromise]);

		expect(order).toEqual(['write-started', 'write-finished', 'drop:orders']);
	});

	it('switchTo drains the outgoing scope before activating the target', async () => {
		const order: string[] = [];
		let releaseWrite: () => void = () => {};
		const db = {
			listCollections: () => ['orders'],
			resetCollection: async () => {},
			pendingMutationCount: async () => 0,
			close: async () => {},
		};
		const manager = new StoreScopeManager({ createDatabase: async () => db });
		await manager.switchTo('scope-a');
		let writePromise!: Promise<'applied' | 'dropped'>;
		await manager.runGuarded(async (bound) => {
			writePromise = bound.guardWrite(
				() =>
					new Promise<void>((resolve) => {
						releaseWrite = () => {
							order.push('write-finished');
							resolve();
						};
						order.push('write-started');
					})
			);
		});

		const switchPromise = manager.switchTo('scope-b').then(() => order.push('switched'));
		await Promise.resolve();
		releaseWrite();
		await Promise.all([writePromise, switchPromise]);

		expect(order).toEqual(['write-started', 'write-finished', 'switched']);
	});
});
