/**
 * @jest-environment jsdom
 *
 * The Orders header painted and the body stayed empty (CI run 33295532237, iOS tablet, flow 05). `FilterBar` built the
 * stores `ObservableResource` during render and `StorePill` consumed it with no boundary of
 * its own, so two things went wrong at once.
 *
 * The suspension escaped the screen entirely — the nearest boundary was the one expo-router
 * wraps every route in, whose PRODUCTION fallback is `null` — so the whole Orders body
 * disappeared rather than one pill.
 *
 * And it never ended: `ObservableResource` subscribes in its constructor and `read()` throws
 * a fresh promise until the first value lands, so every retry built a resource that suspended
 * for the same reason the last one did. Measured in the app, `FilterBar` renders and resource
 * constructions ran 1:1 on every navigation to Orders; on CI the loop ran 7,746 times in
 * ~100 s, ~11 ms apart, and the screen never mounted.
 *
 * Separate from `filter-bar.test.tsx` because that file is deliberately blind to all of this,
 * and has to stay that way to keep testing what it tests: it mocks `@wcpos/components/suspense`
 * to a pass-through and hands `populate$` a synchronous `of([])`, so nothing there can ever
 * suspend. These tests exist to keep a boundary and an async source in the picture.
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { Observable, of } from 'rxjs';

import type { StoreDocument } from '@wcpos/database';

import { FilterBar } from './filter-bar';

let populateCalls = 0;
let storesSource$: Observable<StoreDocument[]>;
// A fresh document per test: `storeListResource` caches per credentials document by design,
// so sharing one across tests would serve the previous test's already-settled resource.
let wpCredentials: { populate$: (field: string) => Observable<StoreDocument[]> };

const freshCredentials = () => ({
	populate$: (field: string) => {
		expect(field).toBe('stores');
		populateCalls++;
		return storesSource$;
	},
});

jest.mock('../../../query', () => ({
	useQueryState: () => undefined,
}));
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({}),
}));
jest.mock('@wcpos/sync-core', () => ({
	isGuestCustomer: () => false,
}));
jest.mock('./force-refresh-filter-customer', () => ({
	forceRefreshFilterCustomer: jest.fn(),
}));
jest.mock('../../../contexts/app-state', () => ({
	useStoreSession: () => ({ wpCredentials }),
}));
jest.mock('../hooks/use-guest-customer', () => ({
	useGuestCustomer: () => ({ id: 0 }),
}));
jest.mock('../hooks/use-engine-document', () => ({
	// Already-settled: these two pills are not what these tests are about.
	useEngineRecordByWooId: () => new ObservableResource(of(null)),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('../components/order/filter-bar/status-pill', () => ({
	StatusPill: () => <div data-testid="status-pill" />,
}));
jest.mock('../components/order/filter-bar/date-range-pill', () => ({
	DateRangePill: () => <div data-testid="date-range-pill" />,
}));
jest.mock('../components/order/filter-bar/customer-pill', () => ({
	CustomerPill: () => <div data-testid="customer-pill" />,
}));
jest.mock('../components/order/filter-bar/cashier-pill', () => ({
	CashierPill: () => <div data-testid="cashier-pill" />,
}));
// Stands in for the real StorePill at the one thing that matters here: it suspends on the
// resource FilterBar hands it.
jest.mock('../components/order/filter-bar/store-pill', () => ({
	StorePill: ({ resource }: { resource: ObservableResource<StoreDocument[]> }) => {
		const stores = useObservableSuspense(resource);
		return <div data-testid="order-filter-store">{stores.length}</div>;
	},
}));

/** Lets every pending microtask (and the React retry it schedules) run. */
const settle = async () => {
	for (let i = 0; i < 25; i++) {
		await React.act(async () => {
			await Promise.resolve();
		});
	}
};

/** Emits one microtask after each subscribe — the shape of an RxDB `populate$`. */
const asyncStores = (): Observable<StoreDocument[]> =>
	new Observable<StoreDocument[]>((subscriber) => {
		void Promise.resolve().then(() => subscriber.next([{ id: 0, name: 'Store' } as StoreDocument]));
	});

const renderBar = () =>
	render(
		<React.Suspense fallback={<div data-testid="route-fallback" />}>
			<FilterBar />
		</React.Suspense>
	);

beforeEach(() => {
	populateCalls = 0;
	wpCredentials = freshCredentials();
});

describe('orders filter bar', () => {
	it('subscribes the stores resource once, however many times the bar re-renders', async () => {
		// The retry loop is only visible as a COUNT: each attempt built its own resource, and
		// each resource subscribed `populate$('stores')` again. One subscription means the
		// second attempt read back the resource the first one already had in flight, which is
		// what lets the first emission end the wait instead of starting the next one.
		storesSource$ = asyncStores();
		renderBar();
		await settle();

		expect(await screen.findByTestId('order-filter-store')).toBeTruthy();
		expect(populateCalls).toBe(1);
	});

	it('keeps the rest of the bar on screen while the store pill is still waiting', async () => {
		// A pill that has not got its records yet is a pill-sized problem. Escaping to the
		// route boundary — production fallback `null` — is how it became a screen-sized one.
		storesSource$ = new Observable<StoreDocument[]>(() => {
			/* never emits */
		});
		renderBar();
		await settle();

		expect(screen.queryByTestId('route-fallback')).toBeNull();
		expect(screen.getByTestId('status-pill')).toBeTruthy();
		expect(screen.getByTestId('date-range-pill')).toBeTruthy();
		expect(screen.queryByTestId('order-filter-store')).toBeNull();
	});
});
