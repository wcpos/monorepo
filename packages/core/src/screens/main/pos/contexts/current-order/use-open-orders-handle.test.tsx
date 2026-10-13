/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from 'react-error-boundary';
import { fillWithDefaultSettings, getQueryMatcher, normalizeMangoQuery } from 'rxdb';
import { BehaviorSubject, map, type Observable, of, throwError } from 'rxjs';

import { OPEN_ORDERS_SORT, openOrdersSelector } from '@wcpos/query';
import { POS_META_KEYS } from '@wcpos/sync-core';
import { engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';
import type { QueryHandle } from '@wcpos/query';

import { useQuerySnapshot } from '../../../../../query/query-handles';
import { useOpenOrdersHandle } from './use-open-orders-handle';

import type { RxJsonSchema } from 'rxdb';

type EngineDocument = Record<string, unknown> & {
	uuid: string;
	status: string;
	payload: Record<string, unknown>;
};

type FakeDatabase = {
	collections: {
		orders: {
			find: jest.Mock;
		};
	};
};

let activeDatabase: FakeDatabase | null;
const databaseSubscribers = new Set<(database: FakeDatabase | null) => void>();
const releaseRequirement = jest.fn();
const requireOrders = jest.fn(() => ({
	ready: Promise.reject(new Error('demand unavailable')),
	release: releaseRequirement,
	queryKey: null,
}));

const engine = {
	db$: (subscriber: (database: FakeDatabase | null) => void) => {
		databaseSubscribers.add(subscriber);
		subscriber(activeDatabase);
		return () => databaseSubscribers.delete(subscriber);
	},
	active: () => (activeDatabase ? { database: activeDatabase } : null),
	ready: Promise.resolve(),
	require: requireOrders,
	status: () => ({ collections: { orders: { active: false, coverageGeneration: 0 } } }),
	statusChanges: (listener: (status: unknown) => void) => {
		listener(engine.status());
		return () => undefined;
	},
};
const manager = { engine };

jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useQueryRuntime: () => manager,
}));

function order(
	uuid: string,
	remoteId: number,
	dateCreatedGmt: string,
	cashierId: number,
	storeId: number,
	registerId?: string
) {
	const document: EngineDocument = {
		posUserId: String(cashierId),
		posStoreId: String(storeId),
		uuid,
		remoteId: String(remoteId),
		remoteKey: String(String(remoteId) ?? ''),
		status: 'pos-open',
		dateCreatedGmt,
		payload: {
			id: remoteId,
			status: 'pos-open',
			date_created_gmt: dateCreatedGmt,
			meta_data: [
				{ key: '_pos_user', value: String(cashierId) },
				{ key: '_pos_store', value: String(storeId) },
				...(registerId ? [{ key: POS_META_KEYS.register, value: registerId }] : []),
			],
		},
	};
	return {
		...document,
		dateCreatedGmt,
		$: of(document),
		collection: { name: 'orders' },
		getLatest: () => order(uuid, remoteId, dateCreatedGmt, cashierId, storeId, registerId),
		toJSON: () => document,
	};
}

const ORDERS_SCHEMA = fillWithDefaultSettings(
	engineSyncCollectionCreators().orders.schema as RxJsonSchema<Record<string, unknown>>
);

/**
 * The cashier/store scope and the creation order are the STORAGE's (#2242), so the fake
 * collection answers `find` the way storage would: rxdb's own matcher over the selector it
 * was given, in `dateCreatedGmt` order. The seam test in the query package runs the
 * same selector against real engines; this fake only has to honour it.
 */
function databaseWith<T extends ReturnType<typeof order>>(
	orders$: BehaviorSubject<T[]>
): FakeDatabase {
	return {
		collections: {
			orders: {
				find: jest.fn(({ selector }: { selector: Record<string, unknown> }) => {
					const matches = getQueryMatcher(
						ORDERS_SCHEMA,
						normalizeMangoQuery(ORDERS_SCHEMA, { selector: selector as never })
					);
					return {
						$: orders$.pipe(
							map((records) =>
								records
									.filter((record) => matches(record as never))
									.sort((a, b) => String(a.dateCreatedGmt).localeCompare(String(b.dateCreatedGmt)))
							)
						),
					};
				}),
			},
		},
	};
}

function emitDatabase(database: FakeDatabase) {
	activeDatabase = database;
	for (const subscriber of databaseSubscribers) subscriber(database);
}

type Scope = { cashierID?: number; storeID?: number; registerID?: string | null };

/** What the reader below the boundary last committed: the open orders' ids, in order. */
let rendered: string[] | null;
/** The same hits as `[id, record.uuid]`: the id and the record it was mapped from. */
let renderedPairs: [string, unknown][] | null;
let ownedHandle: QueryHandle | null;

function Reader({ handle }: { handle: QueryHandle }) {
	const { hits } = useQuerySnapshot(handle, ['hits']);
	React.useEffect(() => {
		rendered = hits.map((hit) => hit.id);
		renderedPairs = hits.map((hit) => [hit.id, (hit.record as { uuid?: unknown }).uuid]);
	}, [hits]);
	return null;
}

/**
 * The `(pos)/_layout.tsx` shape: the owner acquires and retains the handle ABOVE the Suspense
 * its reader suspends in, and its own boundary's reset retries the read.
 */
function Owner({ cashierID, storeID, registerID }: Scope) {
	const handle = useOpenOrdersHandle(cashierID, storeID, registerID);
	React.useEffect(() => {
		ownedHandle = handle;
	}, [handle]);
	return (
		<ErrorBoundary
			onReset={() => handle.retry()}
			resetKeys={[handle]}
			fallbackRender={({ resetErrorBoundary }) => (
				<button data-testid="retry" onClick={resetErrorBoundary} />
			)}
		>
			<React.Suspense fallback={null}>
				<Reader handle={handle} />
			</React.Suspense>
		</ErrorBoundary>
	);
}

/** Lets the owner's retain, the answer and React's retry of the suspended reader all land. */
async function settle() {
	for (let i = 0; i < 5; i += 1) {
		await act(async () => {
			await Promise.resolve();
		});
	}
}

async function mount(scope: Scope) {
	const view = render(<Owner {...scope} />);
	await settle();
	return {
		...view,
		rerender: async (next: Scope) => {
			view.rerender(<Owner {...next} />);
			await settle();
		},
		unmount: async () => {
			view.unmount();
			// The handle releases its read and demand one microtask after its last holder.
			await settle();
		},
	};
}

describe('useOpenOrdersHandle', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		activeDatabase = null;
		databaseSubscribers.clear();
		rendered = null;
		renderedPairs = null;
		ownedHandle = null;
	});

	it('reads pos-open orders scoped by cashier/store in storage order, and rebinds scopes', async () => {
		const orders$ = new BehaviorSubject([
			order('late', 3, '2026-07-14T12:00:00', 7, 2, 'register-b'),
			order('wrong-store', 4, '2026-07-14T09:00:00', 7, 9),
			order('early', 2, '2026-07-14T10:00:00', 7, 2, 'register-a'),
			order('wrong-cashier', 5, '2026-07-14T08:00:00', 8, 2),
		]);
		const firstDatabase = databaseWith(orders$);
		activeDatabase = firstDatabase;
		const view = await mount({ cashierID: 7, storeID: 2, registerID: null });

		// Mutation: build the selector from anything but `openOrdersSelector(7, 2)` → fails.
		expect(firstDatabase.collections.orders.find).toHaveBeenCalledWith({
			selector: openOrdersSelector(7, 2),
			sort: OPEN_ORDERS_SORT,
		});
		// Mutation: drop the store/cashier scope → 'wrong-store' / 'wrong-cashier' appear.
		expect(rendered).toEqual(['early', 'late']);
		// Mutation: map `record` from anything but the storage record → the uuids no longer pair.
		expect(renderedPairs).toEqual([
			['early', 'early'],
			['late', 'late'],
		]);

		await act(async () => {
			orders$.next([...orders$.value, order('new', 6, '2026-07-14T13:00:00', 7, 2)]);
		});
		// Mutation: read the residents once (`take(1)`) → 'new' never arrives.
		expect(rendered).toEqual(['early', 'late', 'new']);
		await view.rerender({ cashierID: 7, storeID: 2, registerID: 'register-a' });
		// Mutation: leave the register out of the handle key → the null-register rows stay.
		expect(rendered).toEqual(['early']);
		await view.rerender({ cashierID: 7, storeID: 2, registerID: 'register-b' });
		expect(rendered).toEqual(['late']);
		await view.rerender({ cashierID: 7, storeID: 2, registerID: null });
		expect(rendered).toEqual(['early', 'late', 'new']);

		const nextOrders$ = new BehaviorSubject([order('next-scope', 10, '2026-07-14T14:00:00', 7, 2)]);
		await act(async () => emitDatabase(databaseWith(nextOrders$)));
		// Mutation: read the database once instead of following `observeEngineDatabases` → stale rows.
		expect(rendered).toEqual(['next-scope']);
	});

	it('rebinds when a replacement database has the same number of open orders', async () => {
		activeDatabase = databaseWith(
			new BehaviorSubject([order('first-scope', 2, '2026-07-14T10:00:00', 7, 2)])
		);
		await mount({ cashierID: 7, storeID: 2 });
		expect(rendered).toEqual(['first-scope']);

		await act(async () => {
			emitDatabase(
				databaseWith(new BehaviorSubject([order('next-scope', 3, '2026-07-14T11:00:00', 7, 2)]))
			);
		});

		// Mutation: dedupe the snapshot on the hit count → the previous database's row stays.
		expect(rendered).toEqual(['next-scope']);
	});

	it('uses cashier-only filtering when the store id is unavailable', async () => {
		activeDatabase = databaseWith(
			new BehaviorSubject([
				order('first-store', 2, '2026-07-14T10:00:00', 7, 2),
				order('second-store', 3, '2026-07-14T11:00:00', 7, 9),
				order('wrong-cashier', 4, '2026-07-14T12:00:00', 8, 2),
			])
		);

		await mount({ cashierID: 7 });

		// Mutation: scope a missing store as some store id → 'second-store' vanishes.
		expect(rendered).toEqual(['first-store', 'second-store']);
	});

	it('holds pos-open order demand for its lifetime without coupling demand failures to residents', async () => {
		activeDatabase = databaseWith(
			new BehaviorSubject([order('resident', 2, '2026-07-14T10:00:00', 7, 2)])
		);

		const view = await mount({ cashierID: 7, storeID: 2 });

		// Mutation: drop a status from the demands → one fewer declaration.
		expect(requireOrders).toHaveBeenCalledTimes(3);
		for (const status of ['pos-open', 'pos-partial', 'pending']) {
			// Mutation: declare outside the handle's id → the id no longer matches.
			expect(requireOrders).toHaveBeenCalledWith(
				expect.objectContaining({
					id: expect.stringMatching(new RegExp(`^pos:open-orders:qh\\d+:${status}:orders-browse$`)),
					collection: 'orders',
					kind: 'orders-browse',
					status,
				})
			);
		}
		// Mutation: surface the rejected demand as the read's error → the reader throws instead.
		expect(rendered).toEqual(['resident']);
		// Mutation: release the demand while the owner still holds the handle → released early.
		expect(releaseRequirement).not.toHaveBeenCalled();

		await view.unmount();
		// Mutation: forget to stop a demand on the last release → fewer than three releases.
		expect(releaseRequirement).toHaveBeenCalledTimes(3);
	});

	it('releases its engine database subscriber across repeated mounts', async () => {
		for (let mount_ = 0; mount_ < 2; mount_ += 1) {
			const view = await mount({ cashierID: 7, storeID: 2 });
			// Mutation: subscribe the database once per reader instead of once per handle → 2.
			expect(databaseSubscribers.size).toBe(1);

			await view.unmount();
			// Mutation: never stop the read on the last release → the subscriber leaks.
			expect(databaseSubscribers.size).toBe(0);
		}
	});

	it('neither queries nor declares demand when the cashier is unavailable', async () => {
		const database = databaseWith(new BehaviorSubject([order('open', 1, '2026-01-01', 7, 2)]));
		activeDatabase = database;
		await mount({ storeID: 2 });
		// Mutation: hand a missing cashier the open-orders handle → a query and three demands.
		expect(rendered).toEqual([]);
		expect(database.collections.orders.find).not.toHaveBeenCalled();
		expect(requireOrders).not.toHaveBeenCalled();
	});

	it('declares the demands and reads the rows once the cashier arrives at boot', async () => {
		activeDatabase = databaseWith(
			new BehaviorSubject([order('resident', 2, '2026-07-14T10:00:00', 7, 2)])
		);
		const view = await mount({ storeID: 2 });
		expect(rendered).toEqual([]);
		expect(requireOrders).not.toHaveBeenCalled();

		await view.rerender({ cashierID: 7, storeID: 2 });
		// Mutation: leave the cashier out of the key → the empty handle stays, nothing is declared.
		expect(requireOrders).toHaveBeenCalledTimes(3);
		expect(rendered).toEqual(['resident']);
	});

	it('treats an empty register id as no register: one handle, no register condition', async () => {
		activeDatabase = databaseWith(
			new BehaviorSubject([order('resident', 2, '2026-07-14T10:00:00', 7, 2, 'register-a')])
		);
		const view = await mount({ cashierID: 7, storeID: 2, registerID: null });
		const first = ownedHandle;
		expect(rendered).toEqual(['resident']);

		await view.rerender({ cashierID: 7, storeID: 2, registerID: '' });
		// Mutation: key the register as `registerID ?? null` → '' is a second handle for one query.
		expect(ownedHandle).toBe(first);
		expect(rendered).toEqual(['resident']);
	});

	it('resolves to no resident open orders when the engine database is unavailable', async () => {
		await mount({ cashierID: 7, storeID: 2 });

		// Mutation: wait for a database before answering → the reader stays suspended (null).
		expect(rendered).toEqual([]);
	});

	it("retries a failed read from the owner's boundary reset", async () => {
		const silence = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		const orders$ = new BehaviorSubject([order('resident', 2, '2026-07-14T10:00:00', 7, 2)]);
		const database = databaseWith(orders$);
		const find = database.collections.orders.find;
		const answer = find.getMockImplementation()!;
		find.mockImplementationOnce(() => ({
			$: throwError(() => new Error('storage gave up')) as Observable<never>,
		}));
		activeDatabase = database;

		await mount({ cashierID: 7, storeID: 2 });
		expect(ownedHandle!.value.error).toEqual(new Error('storage gave up'));
		expect(rendered).toBeNull();
		find.mockImplementation(answer);

		fireEvent.click(screen.getByTestId('retry'));
		await settle();

		// Mutation: drop the boundary's `onReset` retry → the reader remounts over the same failure.
		expect(rendered).toEqual(['resident']);
		expect(ownedHandle!.value.error).toBeNull();
		silence.mockRestore();
	});

	it('keeps the active order reachable when a leg changes its status', async () => {
		const record = order('live', 42, '2026-09-07T12:00:00', 7, 2);
		const orders$ = new BehaviorSubject([record]);
		activeDatabase = databaseWith(orders$);
		await mount({ cashierID: 7, storeID: 2 });
		for (const status of ['pos-open', 'pending', 'pos-partial']) {
			await act(async () =>
				orders$.next([{ ...record, status, payload: { ...record.payload, status } }])
			);
			// Mutation: drop a status from OPEN_ORDER_STATUSES → the cart vanishes mid-checkout.
			expect(rendered).toEqual(['live']);
		}
		await act(async () => orders$.next([{ ...record, status: 'completed' }]));
		// Mutation: stop filtering by status → a completed order stays a tab.
		expect(rendered).toEqual([]);
	});
});
