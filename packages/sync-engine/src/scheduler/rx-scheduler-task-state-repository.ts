import type { PersistedSchedulerTaskState } from './persisted-scheduler-state';
import { schedulerTaskStateKey, type SchedulerTaskStateDocument } from './scheduler-task-state-schema';
import { createRxKeyedRepository, type RxKeyedCollection } from '../collections/rx-keyed-repository';

/** Seeder-side coalescing outcome (#318): flagged an active in-flight task, or re-queued a settled one. */
export type RerunOrReseedOutcome = 'rerun-requested' | 'requeued' | 'skipped';
/** Runner-side coalescing outcome (#318): completed, re-queued (a rerun was requested), or lost the claim. */
export type CompleteOrRequeueOutcome = 'completed' | 'requeued' | 'claim-lost';

function toDocument(state: PersistedSchedulerTaskState): SchedulerTaskStateDocument {
  const { collection, ...rest } = state;
  return { ...rest, stateKey: schedulerTaskStateKey(state.taskId), collectionName: collection, schemaVersion: 4 };
}

function fromDocument(document: SchedulerTaskStateDocument): PersistedSchedulerTaskState {
  const { schemaVersion: _schemaVersion, stateKey: _stateKey, collectionName, ...state } = document;
  return { ...state, collection: collectionName };
}

function sameStringArray(left?: string[], right?: string[]): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameNumberArray(left?: number[], right?: number[]): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameSchedulerTaskState(left: PersistedSchedulerTaskState, right: PersistedSchedulerTaskState): boolean {
  return left.taskId === right.taskId
    && left.requirementId === right.requirementId
    && left.collection === right.collection
    && left.queryKey === right.queryKey
    && sameStringArray(left.ids, right.ids)
    && sameNumberArray(left.wooIds, right.wooIds)
    && left.limit === right.limit
    && left.priority === right.priority
    && left.mode === right.mode
    && left.status === right.status
    && left.ownerId === right.ownerId
    && left.claimedUntilMs === right.claimedUntilMs
    && left.attempt === right.attempt
    && left.retryAfterMs === right.retryAfterMs
    && left.updatedAtMs === right.updatedAtMs;
}

function byTaskId(left: PersistedSchedulerTaskState, right: PersistedSchedulerTaskState): number {
  return left.taskId.localeCompare(right.taskId);
}

function byRunnablePriority(left: PersistedSchedulerTaskState, right: PersistedSchedulerTaskState): number {
  return right.priority - left.priority || left.taskId.localeCompare(right.taskId);
}

function isRunnable(state: PersistedSchedulerTaskState, nowMs: number): boolean {
  if (state.status === 'queued') return true;
  if (state.status === 'in-flight') return state.claimedUntilMs !== null && state.claimedUntilMs <= nowMs;
  if (state.status === 'failed') return state.retryAfterMs !== null && state.retryAfterMs <= nowMs;
  return false;
}

/** Structural: any database carrying the schedulerTaskStates collection (LabDatabase and engine scope dbs both satisfy it). */
export type SchedulerTaskStateDatabase = { schedulerTaskStates: RxKeyedCollection<SchedulerTaskStateDocument> };

export class RxSchedulerTaskStateRepository {
  private readonly keyed;

  constructor(db: SchedulerTaskStateDatabase) {
    this.keyed = createRxKeyedRepository({
      collection: db.schedulerTaskStates,
      keyOf: (state: PersistedSchedulerTaskState) => schedulerTaskStateKey(state.taskId),
      toDocument,
      fromDocument,
    });
  }

  async upsert(state: PersistedSchedulerTaskState): Promise<void> {
    await this.keyed.upsert(state);
  }

  async claimNew(state: PersistedSchedulerTaskState): Promise<boolean> {
    return this.keyed.insertIfAbsent(state);
  }

  async readForTaskIds(taskIds: string[]): Promise<PersistedSchedulerTaskState[]> {
    if (taskIds.length === 0) return [];
    const requested = new Set(taskIds);
    const requestedStateKeys = taskIds.map(schedulerTaskStateKey);
    const states = await this.keyed.readMany({
      selector: { stateKey: { $in: requestedStateKeys } },
      sort: [{ stateKey: 'asc' }],
    });

    return states
      .filter((state) => requested.has(state.taskId))
      .sort(byTaskId);
  }

  async readRunnable(nowMs: number): Promise<PersistedSchedulerTaskState[]> {
    const states = await this.keyed.readMany({
      selector: { status: { $in: ['queued', 'in-flight', 'failed'] } },
      sort: [{ priority: 'desc' }],
    });

    return states
      .filter((state) => isRunnable(state, nowMs))
      .sort(byRunnablePriority);
  }

  async claim(expectedState: PersistedSchedulerTaskState, claimedState: PersistedSchedulerTaskState): Promise<boolean> {
    return this.replaceIfCurrent(expectedState, claimedState);
  }

  async markFailed(expectedState: PersistedSchedulerTaskState, failedState: PersistedSchedulerTaskState): Promise<boolean> {
    return this.replaceIfCurrent(expectedState, failedState);
  }

  async markCompleted(expectedState: PersistedSchedulerTaskState, completedState: PersistedSchedulerTaskState): Promise<boolean> {
    return this.replaceIfCurrent(expectedState, completedState);
  }

  /**
   * Change-signal coalescing (#318), SEEDER side. A fresh change arrived for a task
   * that was read as in-flight. Atomically decide, against the CURRENT doc:
   *  - still actively owned in-flight (lease valid) → set `rerunRequested` (the owner
   *    re-queues on completion). The flag-set touches NO field `sameSchedulerTaskState`
   *    compares, so the owner's in-flight completion CAS still matches.
   *  - anything else (completed / lease-expired / already re-queued) → seed a fresh
   *    queued run now (race: the owner finished between our read and this write).
   * One atomic `incrementalModify` so the decision + write cannot tear.
   */
  async requestRerunOrReseed(
    expectedInFlight: PersistedSchedulerTaskState,
    reseededState: PersistedSchedulerTaskState,
    nowMs: number,
  ): Promise<RerunOrReseedOutcome> {
    const document = await this.keyed.findDocument(schedulerTaskStateKey(expectedInFlight.taskId));
    if (!document?.incrementalModify) return 'skipped';

    let outcome: RerunOrReseedOutcome = 'skipped';
    await document.incrementalModify((currentDocument) => {
      const current = fromDocument(currentDocument);
      // Still actively owned in-flight → flag it; the owner re-runs on completion.
      if (current.status === 'in-flight' && current.claimedUntilMs !== null && current.claimedUntilMs > nowMs) {
        outcome = 'rerun-requested';
        return { ...currentDocument, rerunRequested: true };
      }
      // Only a COMPLETED task needs a re-seed: it advanced the cursor past the change with
      // no future run scheduled. A failed / queued / lease-expired task will run again on
      // its own (retry after backoff / already runnable / re-claim) and re-fetch the change,
      // so we leave it untouched — critically preserving a just-failed task's retry backoff.
      if (current.status === 'completed') {
        outcome = 'requeued';
        return toDocument({ ...reseededState, rerunRequested: false });
      }
      outcome = 'skipped';
      return currentDocument;
    });
    return outcome;
  }

  /**
   * Change-signal coalescing (#318), RUNNER side. Called where the runner would
   * `markCompleted`. Atomically, against the CURRENT doc:
   *  - not still ours (CAS on `sameSchedulerTaskState`) → claim-lost, leave as-is.
   *  - `rerunRequested` set → re-queue a fresh run (clearing the flag) instead of
   *    completing, so the change the in-flight fetch may have missed is re-pulled.
   *  - otherwise → complete normally.
   */
  async completeOrRequeue(
    expectedState: PersistedSchedulerTaskState,
    completedState: PersistedSchedulerTaskState,
    requeuedState: PersistedSchedulerTaskState,
  ): Promise<CompleteOrRequeueOutcome> {
    if (expectedState.taskId !== completedState.taskId || expectedState.taskId !== requeuedState.taskId) return 'claim-lost';

    const document = await this.keyed.findDocument(schedulerTaskStateKey(expectedState.taskId));
    if (!document?.incrementalModify) return 'claim-lost';

    let outcome: CompleteOrRequeueOutcome = 'claim-lost';
    await document.incrementalModify((currentDocument) => {
      const current = fromDocument(currentDocument);
      if (!sameSchedulerTaskState(current, expectedState)) {
        outcome = 'claim-lost';
        return currentDocument;
      }
      if (current.rerunRequested === true) {
        outcome = 'requeued';
        return toDocument({ ...requeuedState, rerunRequested: false });
      }
      outcome = 'completed';
      return toDocument(completedState);
    });
    return outcome;
  }

  async remove(expectedState: PersistedSchedulerTaskState): Promise<boolean> {
    return this.keyed.removeIfCurrent(expectedState, sameSchedulerTaskState);
  }

  private async replaceIfCurrent(expectedState: PersistedSchedulerTaskState, nextState: PersistedSchedulerTaskState): Promise<boolean> {
    return this.keyed.replaceIfCurrent(
      expectedState,
      nextState,
      sameSchedulerTaskState,
      // The coalescing flag (#318) is sticky across ordinary state transitions.
      (currentDocument, nextDocument) => currentDocument.rerunRequested
        ? { ...nextDocument, rerunRequested: true }
        : nextDocument,
    );
  }
}
