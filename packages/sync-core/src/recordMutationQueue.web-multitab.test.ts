import { describe, expect, it } from 'vitest';

import { RecordMutationQueue } from './recordMutationQueue';

import type {
	QueuedMutation,
	RecordMutationStorage,
	RevisionToken,
	StoredMutation,
} from './recordMutationQueue';
import type { RecordMutation } from './recordMutation';

/**
 * WEB TWO-TAB TOPOLOGY (#1055 / #1050-web / #1045).
 *
 * Two browser tabs of the same store each run their OWN OPFS storage worker.
 * They share the on-disk OPFS files (origin + database name), serialized by
 * `navigator.locks` — but each worker keeps its OWN in-memory `_rev` cache that
 * the other never sees. So the revision-checked CAS (`appendIfUnchanged`,
 * `claimForResolution`) is checked against a PER-TAB `_rev`, and last-writer
 * wins on the shared bytes.
 *
 * `InMemoryRecordMutationStorage` (used by the existing cross-process test)
 * shares ONE Map + ONE revision counter, which is the ELECTRON topology (both
 * windows proxy to one main-process storage) — and there the CAS fences, which
 * is exactly why #1050 is sound for Electron. This double is different: it
 * reproduces WEB, where the CAS does NOT fence, so it must be gated by a single
 * write-plane leader instead.
 */
class SharedDisk {
	// The durable bytes both tabs' workers read/write, last-writer-wins.
	readonly rows = new Map<string, { mutation: QueuedMutation; rev: number }>();
	revCounter = 0;
	nextRev(): number {
		this.revCounter += 1;
		return this.revCounter;
	}
}

/**
 * One tab's OPFS worker view over the shared disk. Reads snapshot the disk into
 * a per-tab cache; the revision token a tab hands back to a CAS is the token IT
 * last read — NOT the disk's current token. That per-tab staleness is the whole
 * bug: two tabs that each read `rev-3` both pass `appendIfUnchanged(_, rev-3)`
 * even after the other already moved the disk.
 */
class WebTabStorage implements RecordMutationStorage {
	private readonly cache = new Map<string, number>();
	constructor(private readonly disk: SharedDisk) {}

	private snapshot(mutationId: string, rev: number) {
		this.cache.set(mutationId, rev);
	}

	async list(): Promise<QueuedMutation[]> {
		return [...this.disk.rows.values()].map((entry) => {
			this.snapshot(entry.mutation.mutationId, entry.rev);
			return entry.mutation;
		});
	}

	async listStored(): Promise<StoredMutation[]> {
		return [...this.disk.rows.values()].map((entry) => {
			// The tab caches the rev it just observed; a later CAS checks against
			// THIS token, not the disk's live one.
			this.snapshot(entry.mutation.mutationId, entry.rev);
			return { mutation: entry.mutation, rev: `rev-${entry.rev}` as RevisionToken };
		});
	}

	async append(mutation: QueuedMutation): Promise<void> {
		const rev = this.disk.nextRev();
		this.disk.rows.set(mutation.mutationId, { mutation, rev });
		this.snapshot(mutation.mutationId, rev);
	}

	async appendIfUnchanged(
		mutation: QueuedMutation,
		expectedRev: RevisionToken | null
	): Promise<boolean> {
		const onDisk = this.disk.rows.get(mutation.mutationId);
		if (expectedRev === null) {
			if (onDisk) return false;
		} else {
			// THE WEB BUG: the precondition is checked against this tab's OWN cached
			// rev, which the other tab's write never invalidated. A coherent storage
			// would compare against the disk's live rev and reject the stale tab.
			const cached = this.cache.get(mutation.mutationId);
			if (cached === undefined || `rev-${cached}` !== expectedRev) return false;
		}
		const rev = this.disk.nextRev();
		this.disk.rows.set(mutation.mutationId, { mutation, rev });
		this.snapshot(mutation.mutationId, rev);
		return true;
	}

	async remove(mutationIds: readonly string[]): Promise<void> {
		for (const id of mutationIds) this.disk.rows.delete(id);
	}

	async removeIfUnchanged(mutationId: string, expectedRev: RevisionToken): Promise<boolean> {
		const cached = this.cache.get(mutationId);
		if (cached === undefined || `rev-${cached}` !== expectedRev) return false;
		this.disk.rows.delete(mutationId);
		return true;
	}
}

const mut = (over: Partial<RecordMutation> = {}): RecordMutation => ({
	mutationId: 'dead-1',
	collectionName: 'orders',
	operation: 'update',
	recordId: 'rec-A',
	origin: 'existing',
	payload: { id: 'rec-A' },
	baseRevision: null,
	queuedAt: '2026-06-26T00:00:00.000Z',
	...over,
});

/** Two tabs over one shared disk, each with its own (non-coherent) rev cache. */
function twoTabs() {
	const disk = new SharedDisk();
	const tabA = new RecordMutationQueue(new WebTabStorage(disk));
	const tabB = new RecordMutationQueue(new WebTabStorage(disk));
	return { disk, tabA, tabB };
}

const seedRejected = async (q: RecordMutationQueue) => {
	const row = await q.enqueue(mut());
	await q.replace({ ...row, status: 'rejected' });
};

const claim = (q: RecordMutationQueue, holder: string) =>
	q.claimForResolution({
		mutationId: 'dead-1',
		expectedStatus: 'rejected',
		holder,
		untilIso: '2026-01-01T00:00:30.000Z',
		nowMs: 0,
	});

describe('web two-tab: the CAS does NOT fence without a single write-plane leader', () => {
	/**
	 * The bug the two-process live smoke reproduced 3/3: Requeue (tab A) vs
	 * Discard (tab B) on the same dead letter. Both tabs' claim passes against
	 * their own cached rev, so both "win" — a requeue creates a real server order
	 * while the concurrent discard also succeeds → a resurrected discard. This
	 * test PINS that failure mode at the storage layer, so the fix is provable.
	 */
	it('reproduces the incoherence: BOTH tabs claim the same dead letter', async () => {
		const { tabA, tabB } = twoTabs();
		await seedRejected(tabA);

		const [a, b] = await Promise.all([claim(tabA, 'tab-A'), claim(tabB, 'tab-B')]);

		// Coherent storage would give exactly one 'claimed' + one 'held'. Here BOTH
		// claim — the incoherence that mandates leader election.
		expect([a, b].filter((o) => o === 'claimed')).toHaveLength(2);
	});

	/**
	 * The fix: the write plane has exactly ONE leader; a follower never runs the
	 * resolution CAS at all (the engine's resolveConflict defers — see
	 * create-rxdb-sync-engine.leader-gate.test.ts). Model that here by routing
	 * every resolution through a single tab. With a single writer the CAS is
	 * trivially exactly-once — the same property Electron's single storage gives.
	 */
	it('with a single write-plane leader, exactly one resolution executes', async () => {
		const { tabA, tabB } = twoTabs();
		await seedRejected(tabA);

		// A single-writer gate: only the leader (tab A) is allowed to resolve.
		const leader: 'A' | 'B' = 'A';
		const gatedClaim = (who: 'A' | 'B') => {
			if (who !== leader) return Promise.resolve('deferred' as const);
			return claim(who === 'A' ? tabA : tabB, `tab-${who}`);
		};

		const [a, b] = await Promise.all([gatedClaim('A'), gatedClaim('B')]);
		expect([a, b].filter((o) => o === 'claimed')).toHaveLength(1);
		expect([a, b].filter((o) => o === 'deferred')).toHaveLength(1);
	});

	/**
	 * Leader death → follower takes over. navigator.locks auto-releases on the
	 * dead tab; a follower is elected and, because the dead letter is DURABLE on
	 * the shared disk, completes the resolution the dead leader never did.
	 */
	it('after leader death, the promoted follower completes the resolution', async () => {
		const { tabA, tabB } = twoTabs();
		await seedRejected(tabA);

		// Tab A was leader but died before resolving. Tab B is promoted.
		// Its claim must succeed against the durable row.
		expect(await claim(tabB, 'tab-B')).toBe('claimed');
		// And the winner retires the row.
		await tabB.remove(['dead-1']);
		expect(await claim(tabB, 'tab-B')).toBe('gone');
	});
});
