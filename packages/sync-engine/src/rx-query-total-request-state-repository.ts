import {
	type QueryTotalRequestState,
	type QueryTotalRequestStateDocument,
	sameQueryTotalRequestState,
} from './scheduler';
import { createRxKeyedRepository, type RxKeyedCollection } from './collections/rx-keyed-repository';

function toDocument(state: QueryTotalRequestState): QueryTotalRequestStateDocument {
	return { ...state, schemaVersion: 3 };
}

function fromDocument(document: QueryTotalRequestStateDocument): QueryTotalRequestState {
	const { schemaVersion: _schemaVersion, ...state } = document;
	return state;
}

function byQueryKey(left: QueryTotalRequestState, right: QueryTotalRequestState): number {
	return left.queryKey.localeCompare(right.queryKey);
}

function isRunnable(state: QueryTotalRequestState, nowMs: number): boolean {
	if (state.status === 'in-flight') {
		return state.claimedUntilMs !== null && state.claimedUntilMs <= nowMs;
	}
	return state.retryAfterMs !== null && state.retryAfterMs <= nowMs;
}

/** Structural: any database carrying the queryTotalRequestStates collection — any engine scope database satisfies it. */
export type QueryTotalRequestStateDatabase = {
	queryTotalRequestStates: RxKeyedCollection<QueryTotalRequestStateDocument>;
};

export class RxQueryTotalRequestStateRepository {
	private readonly keyed;

	constructor(db: QueryTotalRequestStateDatabase) {
		this.keyed = createRxKeyedRepository({
			collection: db.queryTotalRequestStates,
			keyOf: (state: QueryTotalRequestState) => state.queryKey,
			toDocument,
			fromDocument,
		});
	}

	async upsert(state: QueryTotalRequestState): Promise<void> {
		await this.keyed.upsert(state);
	}

	async claimNew(state: QueryTotalRequestState): Promise<boolean> {
		return this.keyed.insertIfAbsent(state);
	}

	async readForQueryKeys(queryKeys: string[]): Promise<QueryTotalRequestState[]> {
		if (queryKeys.length === 0) return [];
		const requested = new Set(queryKeys);
		const states = await this.keyed.readMany({
			selector: { queryKey: { $in: [...requested] } },
			sort: [{ queryKey: 'asc' }],
		});

		return states.filter((state) => requested.has(state.queryKey)).sort(byQueryKey);
	}

	async readRunnable(nowMs: number): Promise<QueryTotalRequestState[]> {
		const states = await this.keyed.readMany({
			selector: { status: { $in: ['in-flight', 'failed'] } },
			sort: [{ queryKey: 'asc' }],
		});

		return states.filter((state) => isRunnable(state, nowMs)).sort(byQueryKey);
	}

	async remove(expectedState: QueryTotalRequestState): Promise<boolean> {
		return this.keyed.removeIfCurrent(expectedState, sameQueryTotalRequestState);
	}

	async claim(
		expectedState: QueryTotalRequestState,
		claimedState: QueryTotalRequestState
	): Promise<boolean> {
		return this.keyed.replaceIfCurrent(expectedState, claimedState, sameQueryTotalRequestState);
	}

	async markFailed(
		expectedState: QueryTotalRequestState,
		failedState: QueryTotalRequestState
	): Promise<boolean> {
		return this.keyed.replaceIfCurrent(expectedState, failedState, sameQueryTotalRequestState);
	}

	async markIdle(
		expectedState: QueryTotalRequestState,
		idleState: QueryTotalRequestState
	): Promise<boolean> {
		return this.keyed.replaceIfCurrent(expectedState, idleState, sameQueryTotalRequestState);
	}

	async wake(
		expectedState: QueryTotalRequestState,
		wokenState: QueryTotalRequestState
	): Promise<boolean> {
		return this.keyed.replaceIfCurrent(expectedState, wokenState, sameQueryTotalRequestState);
	}
}
