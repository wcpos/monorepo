/**
 * @jest-environment jsdom
 *
 * Both readers of this hook — the general settings form and `useNewOrder` — call
 * `useDefaultCustomer()` and `useObservableSuspense(defaultCustomerResource)` in the SAME
 * component, with no boundary in between. That is the Orders blank-body shape (#1707): the
 * resource was built in a `useMemo`, so a render that suspends before it has ever committed
 * takes the memo down with it, and the retry builds another resource that suspends for exactly
 * the reason its predecessor did. A customers query's first emission is always async, so the
 * wait never ends on its own.
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { useObservableSuspense } from 'observable-hooks';
import { Observable } from 'rxjs';

import { useDefaultCustomer } from './use-default-customer';

let subscribeCount = 0;
let result$: Observable<{ hits: { record: { payload: { id: number } } }[] }>;

const engine = {};

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine }),
	// The real bridge, by file: `requireActual('@wcpos/query')` would pull the whole barrel in
	// (and with it the sync-engine that `@wcpos/sync-core` is mocked out from under).
	useSuspenseResource: jest.requireActual('../../../../../query/src/suspense-resource')
		.useSuspenseResource,
}));
jest.mock('@wcpos/sync-core', () => ({
	remoteIdOrNull: (id: number) => (id > 0 ? String(id) : null),
}));
jest.mock('../../../query', () => ({
	useCollectionBinding: () => ({ result$ }),
}));
jest.mock('./use-default-customer-id', () => ({
	useDefaultCustomerID: () => 7,
}));
jest.mock('../hooks/use-guest-customer', () => ({
	useGuestCustomer: () => ({ id: 0 }),
}));

/** Emits one microtask after each subscribe — the shape of an engine query's first value. */
const asyncResult = () =>
	new Observable<{ hits: { record: { payload: { id: number } } }[] }>((subscriber) => {
		subscribeCount++;
		void Promise.resolve().then(() =>
			subscriber.next({ hits: [{ record: { payload: { id: 7 } } }] })
		);
	});

/** The shape both real callers use: build the resource and suspend on it in one component. */
function Screen() {
	const { defaultCustomerResource } = useDefaultCustomer();
	const customer = useObservableSuspense(defaultCustomerResource) as { payload: { id: number } };
	return <div data-testid="default-customer">{customer.payload.id}</div>;
}

/** Lets every pending microtask (and the React retry it schedules) run. */
async function settle() {
	for (let i = 0; i < 25; i++) {
		await React.act(async () => {
			await Promise.resolve();
		});
	}
}

beforeEach(() => {
	subscribeCount = 0;
	result$ = asyncResult();
});

describe('the default customer resource', () => {
	it('mounts on the first emission, having subscribed the query exactly once', async () => {
		render(
			<React.Suspense fallback={<div data-testid="fallback" />}>
				<Screen />
			</React.Suspense>
		);
		await settle();

		expect((await screen.findByTestId('default-customer')).textContent).toBe('7');
		// The count is the whole instrument: one subscription means every retry read back the
		// resource the first attempt already had in flight.
		expect(subscribeCount).toBe(1);
	});

	it('falls back to the guest customer without ever blanking the screen', async () => {
		result$ = new Observable((subscriber) => {
			subscribeCount++;
			void Promise.resolve().then(() => subscriber.next({ hits: [] }));
		});
		function GuestScreen() {
			const { defaultCustomerResource } = useDefaultCustomer();
			const customer = useObservableSuspense(defaultCustomerResource) as { id: number };
			return <div data-testid="guest-customer">{customer.id}</div>;
		}
		render(
			<React.Suspense fallback={<div data-testid="fallback" />}>
				<GuestScreen />
			</React.Suspense>
		);
		await settle();

		expect((await screen.findByTestId('guest-customer')).textContent).toBe('0');
		expect(subscribeCount).toBe(1);
	});
});
