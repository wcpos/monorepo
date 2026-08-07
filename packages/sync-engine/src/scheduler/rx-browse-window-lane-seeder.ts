/**
 * Generic BROWSE-WINDOW scheduler-lane seeder — the shared template behind the three
 * per-collection browse seeders (`seedOrderFilterSchedulerTask`,
 * `seedProductBrowseWindowSchedulerTask`, `seedCustomerBrowseWindowSchedulerTask`).
 *
 * Every browse lane does the same thing and differs only in values captured by
 * {@link BrowseWindowGrammar} plus the two lane defaults here:
 *
 *   encode the window's lane identity through the grammar
 *     → derive its requirementId through the same grammar
 *     → refuse anything over the persisted schema ceilings
 *     → seed ONE task `<queryKey>:windowed` (completed-dedupe semantics preserved verbatim;
 *       see rxSchedulerTaskSeeder.ts) through the ledger-recovery seam.
 *
 * Adding a browse lane is a descriptor, not a copy — the same rule
 * rx-targeted-lane-seeder.ts states for targeted-id lanes.
 *
 * WHY THE KEY IS NOT PASSED IN. The three seeders used to build the lane key themselves,
 * and the orders one rebuilt — byte for byte — the key the demand plane had already
 * derived, then asserted the two agreed at runtime. Deriving it HERE, from the same
 * grammar the parser belongs to, removes the second encoder rather than watching it.
 */

import { assertBrowseWindowKeyLengths, type BrowseWindowGrammar } from './browse-window-grammar';
import {
	seedPersistedSchedulerTasks,
	type SeedPersistedSchedulerTasksResult,
} from './rx-scheduler-task-seeder';
import {
	RxSchedulerTaskStateRepository,
	type SchedulerTaskStateDatabase,
} from './rx-scheduler-task-state-repository';
import { withSchedulerSeedLedgerRecovery } from '../local-coverage/ledger-storage-recovery';

/** The grammar plus the two scheduling defaults that are not part of the key. */
export type BrowseWindowLaneDescriptor<TWindow> = {
	grammar: BrowseWindowGrammar<TWindow>;
	/** Lane priority when the caller does not override it. */
	defaultPriority: number;
	/** Re-seedable window: a completed task re-runs on the next declaration past this. */
	defaultCompletedDedupeForMs: number;
};

export type SeedBrowseWindowLaneInput<TWindow> = {
	/** The window to seed, in the grammar's own field shape. */
	window: TWindow;
	/**
	 * Record budget stored on the task. Usually the window size, but a ranged (`limit=all`)
	 * orders lane stores its per-pass ceiling instead — the key says `all`, the task says how
	 * much one pass may do.
	 */
	limit: number;
	/**
	 * `'greedy'` only for a fetch-to-completion range: the runner keeps calling the fetcher
	 * until it reports `completed`. A windowed task gets exactly ONE fetch invocation.
	 */
	mode: 'windowed' | 'greedy';
	priority?: number | undefined;
	completedDedupeForMs?: number | undefined;
	nowMs?: number | undefined;
	database: SchedulerTaskStateDatabase;
};

export async function seedBrowseWindowLane<TWindow>(
	lane: BrowseWindowLaneDescriptor<TWindow>,
	input: SeedBrowseWindowLaneInput<TWindow>
): Promise<SeedPersistedSchedulerTasksResult> {
	const { grammar } = lane;
	const queryKey = grammar.encode(input.window);
	const requirementId = grammar.requirementId(input.window);
	// Every browse lane's task id is its key plus this suffix, greedy ranged lanes included —
	// the mode lives on the task, not in its identity.
	const id = `${queryKey}:windowed`;
	assertBrowseWindowKeyLengths(grammar, { queryKey, taskId: id, requirementId });
	const nowMs = input.nowMs ?? Date.now();

	// A `schedulerTaskStates` reconciliation refusal rebuilds the derivable ledger
	// and the seed runs again against the fresh store (#956) — callers treat a
	// resolved seed as a durable enqueue, so it must not resolve empty.
	return withSchedulerSeedLedgerRecovery({
		database: input.database,
		run: () =>
			seedPersistedSchedulerTasks({
				repository: new RxSchedulerTaskStateRepository(input.database),
				tasks: [
					{
						id,
						requirementId,
						collection: grammar.collection,
						queryKey,
						limit: input.limit,
						priority: input.priority ?? lane.defaultPriority,
						mode: input.mode,
					},
				],
				nowMs,
				completedDedupeForMs: input.completedDedupeForMs ?? lane.defaultCompletedDedupeForMs,
			}),
	});
}
