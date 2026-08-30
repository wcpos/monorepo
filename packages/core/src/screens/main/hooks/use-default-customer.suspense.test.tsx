/**
 * @jest-environment jsdom
 *
 * `useDefaultCustomer` builds its resource in a `useMemo`, which is only safe while the
 * component that calls it COMMITS. Both readers used to call it and read it in the same
 * component — `GeneralSettings` under `SettingsPage`'s boundary, and `useNewOrder` inside the
 * `Suspense` that `(pos)/_layout.tsx` puts around `CurrentOrderProvider` — so the resource was
 * discarded with the aborted render and every retry built another one that suspended for
 * exactly the reason its predecessor did (#1707). A customers query's first emission is always
 * async, so the wait never ended on its own.
 *
 * Both are fixed by where the boundary sits, not by a cache: the creator now commits above the
 * boundary and only the reader suspends. These tests drive the hook through that shape, and
 * fail against the shape it replaced.
 *
 * `packages/query/tests/suspense-boundary-placement.test.tsx` is the same claim without the app
 * around it.
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { useObservableSuspense } from 'observable-hooks';
import { Observable } from 'rxjs';

import { useDefaultCustomer } from './use-default-customer';

let subscribes = 0;
let result$: Observable<{ hits: { record: { payload: { id: number } } }[] }>;

jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => ({ engine: {} }) }));
jest.mock('@wcpos/sync-core', () => ({
	remoteIdOrNull: (id: number) => (id > 0 ? String(id) : null),
}));
jest.mock('../../../query', () => ({ useCollectionBinding: () => ({ result$ }) }));
jest.mock('./use-default-customer-id', () => ({ useDefaultCustomerID: () => 7 }));
jest.mock('../hooks/use-guest-customer', () => ({ useGuestCustomer: () => ({ id: 0 }) }));

/** Emits one microtask after each subscribe — the shape of an engine query's first value. */
const asyncResult = () =>
	new Observable<{ hits: { record: { payload: { id: number } } }[] }>((subscriber) => {
		subscribes++;
		void Promise.resolve().then(() =>
			subscriber.next({ hits: [{ record: { payload: { id: 7 } } }] })
		);
	});

/**
 * The shape both real callers now use: the creator renders the boundary, the reader sits
 * inside it. `GeneralSettings` does this inline; the POS layout does it by handing the
 * resource to `CurrentOrderProvider` through the `Suspense` it already renders.
 */
function Reader({
	resource,
}: {
	resource: ReturnType<typeof useDefaultCustomer>['defaultCustomerResource'];
}) {
	const customer = useObservableSuspense(resource) as { payload: { id: number } };
	return <div data-testid="default-customer">{customer.payload.id}</div>;
}

function Creator() {
	const { defaultCustomerResource } = useDefaultCustomer();
	return (
		<>
			<div data-testid="creator" />
			<React.Suspense fallback={<div data-testid="own-fallback" />}>
				<Reader resource={defaultCustomerResource} />
			</React.Suspense>
		</>
	);
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
	subscribes = 0;
	result$ = asyncResult();
});

describe('the default customer resource', () => {
	it('mounts on the first emission, having subscribed the query exactly once', async () => {
		render(
			<React.Suspense fallback={<div data-testid="route-fallback" />}>
				<Creator />
			</React.Suspense>
		);
		await settle();

		expect((await screen.findByTestId('default-customer')).textContent).toBe('7');
		// The count is the instrument: one subscription means every retry read back the
		// resource the first attempt already had in flight, because the creator committed.
		expect(subscribes).toBe(1);
	});

	it('costs its own fallback while it waits, never the screen around it', async () => {
		result$ = new Observable(() => {
			subscribes++;
		});
		render(
			<React.Suspense fallback={<div data-testid="route-fallback" />}>
				<Creator />
			</React.Suspense>
		);
		await settle();

		expect(screen.queryByTestId('route-fallback')).toBeNull();
		expect(screen.getByTestId('creator')).toBeTruthy();
		expect(screen.getByTestId('own-fallback')).toBeTruthy();
		expect(subscribes).toBe(1);
	});

	it('loops when the creator is inside the boundary — the shape this replaced', async () => {
		// The control, in one file with its fix. `CreatorAndReader` is `GeneralSettings` and
		// `useNewOrder` as they were: build and read in one component, boundary above.
		//
		// The real loop never ends, which is unusable as a test — `act` would flush forever — so
		// this source relents on the fifth subscription by emitting SYNCHRONOUSLY, which lets
		// that attempt commit and turns the loop into a number. Five subscriptions for one mount
		// is one per attempt.
		const RELENTS_AT = 5;
		result$ = new Observable((subscriber) => {
			subscribes++;
			const hits = [{ record: { payload: { id: 7 } } }];
			if (subscribes >= RELENTS_AT) {
				subscriber.next({ hits });
				return;
			}
			void Promise.resolve().then(() => subscriber.next({ hits }));
		});
		function CreatorAndReader() {
			const { defaultCustomerResource } = useDefaultCustomer();
			const customer = useObservableSuspense(defaultCustomerResource) as {
				payload: { id: number };
			};
			return <div data-testid="inline">{customer.payload.id}</div>;
		}
		render(
			<React.Suspense fallback={<div data-testid="route-fallback" />}>
				<CreatorAndReader />
			</React.Suspense>
		);
		await settle();

		// One subscription per attempt — the 1:1 ratio measured in the app, where nothing
		// relented and the screen never mounted at all.
		expect((await screen.findByTestId('inline')).textContent).toBe('7');
		expect(subscribes).toBe(RELENTS_AT);
	});
});
