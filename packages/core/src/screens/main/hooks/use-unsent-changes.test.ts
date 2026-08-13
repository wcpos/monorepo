import { BehaviorSubject } from 'rxjs';

import { MUTATION_QUEUE_RXDB_COLLECTION } from '@wcpos/sync-engine';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';
import {
	forgetUnsentChanges,
	readUnsentChanges,
	rememberUnsentChanges,
} from '@wcpos/utils/unsent-changes';

import {
	countUnsentChanges,
	describeResetConfirm,
	subscribeToUnsentChanges,
} from './use-unsent-changes';

type FakeQueue = {
	count$: BehaviorSubject<number>;
	execError?: Error;
};

function fakeEngine(queue: FakeQueue | null): RxdbSyncEngine {
	const database =
		queue === null
			? null
			: {
					collections: {
						[MUTATION_QUEUE_RXDB_COLLECTION]: {
							count: () => ({
								$: queue.count$,
								exec: () =>
									queue.execError
										? Promise.reject(queue.execError)
										: Promise.resolve(queue.count$.value),
							}),
						},
					},
				};

	return {
		active: () => (database ? { database } : null),
		db$: (cb: (db: unknown) => void) => {
			cb(database);
			return () => undefined;
		},
	} as unknown as RxdbSyncEngine;
}

beforeEach(() => {
	forgetUnsentChanges();
});

describe('countUnsentChanges', () => {
	it('counts the WHOLE queue — every row is a change the server has never seen', () => {
		// No status selector on purpose: `status` is optional in the queue schema
		// (an absent status means pending), so selecting on it would hide rows, and
		// a hidden row is a sale nobody is warned about losing.
		const engine = fakeEngine({ count$: new BehaviorSubject(3) });

		return expect(countUnsentChanges(engine)).resolves.toEqual({
			status: 'some',
			count: 3,
		});
	});

	it('reports an empty queue as "nothing to lose"', () =>
		expect(countUnsentChanges(fakeEngine({ count$: new BehaviorSubject(0) }))).resolves.toEqual({
			status: 'none',
		}));

	it('falls back to the remembered reading when the queue cannot be read', async () => {
		rememberUnsentChanges(2);
		const engine = fakeEngine({
			count$: new BehaviorSubject(0),
			execError: new Error('DB6'),
		});

		await expect(countUnsentChanges(engine)).resolves.toEqual({
			status: 'some',
			count: 2,
		});
	});

	it('never turns a failed read into "nothing to lose"', async () => {
		const engine = fakeEngine({
			count$: new BehaviorSubject(0),
			execError: new Error('DB6'),
		});

		// Nothing was ever recorded, so the honest answer is "unknown" — the confirm
		// then warns that the wipe MAY destroy unsent sales.
		await expect(countUnsentChanges(engine)).resolves.toEqual({
			status: 'unknown',
		});
	});

	it('does not treat a closed database as an empty queue', async () => {
		await expect(countUnsentChanges(fakeEngine(null))).resolves.toEqual({
			status: 'unknown',
		});
	});
});

describe('subscribeToUnsentChanges', () => {
	it('keeps the remembered reading current for the crash screen', () => {
		const count$ = new BehaviorSubject(1);
		const stop = subscribeToUnsentChanges(fakeEngine({ count$ }));

		expect(readUnsentChanges()).toEqual({ status: 'some', count: 1 });
		count$.next(4);
		expect(readUnsentChanges()).toEqual({ status: 'some', count: 4 });

		stop();
	});

	it('records "unknown" rather than a stale zero when there is no database', () => {
		rememberUnsentChanges(3);
		const stop = subscribeToUnsentChanges(fakeEngine(null));

		expect(readUnsentChanges()).toEqual({ status: 'unknown' });

		stop();
	});
});

describe('describeResetConfirm', () => {
	const keys: string[] = [];
	const t = (key: string, options?: { count: number }) => {
		keys.push(options ? `${key}:${options.count}` : key);
		return key;
	};

	beforeEach(() => {
		keys.length = 0;
	});

	it('states the number, left to i18next to pluralize', () => {
		describeResetConfirm({ status: 'some', count: 2 }, t);

		expect(keys).toEqual([
			'common.clear_all_local_data_unsent:2',
			'common.clear_all_local_data_body',
		]);
	});

	it('gives "unknown" its own sentence rather than the reassuring one', () => {
		describeResetConfirm({ status: 'unknown' }, t);
		expect(keys[0]).toBe('common.clear_all_local_data_unknown');

		keys.length = 0;
		describeResetConfirm({ status: 'none' }, t);
		expect(keys[0]).toBe('common.clear_all_local_data_none');
	});

	it('always says what the wipe itself does, whatever the queue holds', () => {
		for (const unsent of [
			{ status: 'unknown' } as const,
			{ status: 'none' } as const,
			{ status: 'some', count: 1 } as const,
		]) {
			keys.length = 0;
			describeResetConfirm(unsent, t);
			expect(keys).toContain('common.clear_all_local_data_body');
		}
	});
});
