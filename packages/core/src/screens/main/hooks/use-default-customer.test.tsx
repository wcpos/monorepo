import * as React from 'react';

import { act, create } from 'react-test-renderer';
import { Observable } from 'rxjs';

import { useDefaultCustomer } from './use-default-customer';

const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => import('@wcpos/query').QueryHandle & {
		set(partial: Record<string, unknown>): void;
	};
};
const mockUseCollectionQueryHandle = jest.fn();
let mockDefaultCustomerID = 0;

jest.mock('../../../query', () => ({
	useCollectionQueryHandle: (...args: unknown[]) => mockUseCollectionQueryHandle(...args),
}));
jest.mock('@wcpos/query', () => {
	const { distinctUntilChanged, filter, map, of, switchMap, throwError } =
		jest.requireActual('rxjs');
	type Snapshot = { ready: boolean; error: unknown; result: unknown };
	return {
		useQueryRuntime: () => ({ engine: {} }),
		// The real owner of the resource: its read starts on commit, and Strict Mode is safe.
		useOwnedResource: jest.requireActual('../../../../../query/src/use-owned-resource')
			.useOwnedResource,
		// As the real ones. Answers: every answered result, failures skipped.
		queryHandleAnswers$: (handle: import('@wcpos/query').QueryHandle) =>
			handle.observe().pipe(
				filter((snapshot: Snapshot) => snapshot.ready && !snapshot.error),
				map((snapshot: Snapshot) => snapshot.result)
			),
		// Results: every answered result, a failure thrown.
		queryHandleResults$: (handle: import('@wcpos/query').QueryHandle) =>
			handle.observe().pipe(
				switchMap((snapshot: Snapshot) =>
					snapshot.error ? throwError(() => snapshot.error) : of(snapshot)
				),
				filter((snapshot: Snapshot) => snapshot.ready),
				map((snapshot: Snapshot) => snapshot.result),
				distinctUntilChanged()
			),
	};
});
jest.mock('./use-default-customer-id', () => ({
	useDefaultCustomerID: () => mockDefaultCustomerID,
}));
jest.mock('../hooks/use-guest-customer', () => ({
	useGuestCustomer: () => ({ id: 0, billing: {}, shipping: {} }),
}));

type DefaultCustomer = ReturnType<typeof useDefaultCustomer>;
let captured: DefaultCustomer | undefined;
const capture = (value: DefaultCustomer) => {
	captured = value;
};
function Harness({ onValue = capture }: { onValue?: (value: DefaultCustomer) => void }) {
	onValue(useDefaultCustomer());
	return null;
}

/** A fake handle that counts its live `observe()` subscriptions — the hook's readers. */
function countedHandle(initial?: Record<string, unknown>) {
	const handle = fakeQueryHandle(initial);
	const observe = handle.observe;
	const counted = { handle, live: 0 };
	handle.observe = () =>
		new Observable((subscriber) => {
			counted.live += 1;
			const inner = observe().subscribe(subscriber);
			return () => {
				counted.live -= 1;
				inner.unsubscribe();
			};
		});
	return counted;
}

describe('useDefaultCustomer', () => {
	beforeEach(() => {
		mockUseCollectionQueryHandle.mockReset();
		mockUseCollectionQueryHandle.mockReturnValue(fakeQueryHandle());
	});

	it('declares no woo target for the guest default (0) — an include=0 pull jams the customers cursor (#850)', () => {
		mockDefaultCustomerID = 0;
		act(() => {
			create(<Harness />);
		});
		expect(mockUseCollectionQueryHandle).toHaveBeenCalledWith('customers', expect.any(Object), {
			remoteIds: [],
		});
	});

	it('targets the configured woo customer when the default is a real id', () => {
		mockDefaultCustomerID = 42;
		act(() => {
			create(<Harness />);
		});
		expect(mockUseCollectionQueryHandle).toHaveBeenCalledWith('customers', expect.any(Object), {
			remoteIds: ['42'],
		});
	});
	it('serves the guest for an empty answer, and throws a failed read on to the readers', () => {
		mockDefaultCustomerID = 42;
		const { handle } = countedHandle();
		mockUseCollectionQueryHandle.mockReturnValue(handle);
		act(() => {
			create(<Harness />);
		});
		expect(captured!.defaultCustomerResource.read()).toEqual({ id: 0, billing: {}, shipping: {} });

		// A failed customers read is not "no default customer": the boundary gets it, instead of
		// the POS order and the settings page waiting on a guest forever.
		const failure = new Error('customers read failed');
		act(() => handle.set({ error: failure }));
		expect(() => captured!.defaultCustomerResource.read()).toThrow(failure);
	});

	it('retry() asks the customers handle again and the resource yields its answer', () => {
		mockDefaultCustomerID = 42;
		const failure = new Error('customers read failed');
		const handle = fakeQueryHandle({ ready: false, error: failure });
		const retry = jest.spyOn(handle, 'retry').mockImplementation(() => handle.set({ error: null }));
		mockUseCollectionQueryHandle.mockReturnValue(handle);
		act(() => {
			create(<Harness />);
		});
		expect(() => captured!.defaultCustomerResource.read()).toThrow(failure);

		act(() => captured!.retry());
		// Mutation: skip `handle.retry()` → the handle keeps its failure and nothing re-reads.
		expect(retry).toHaveBeenCalledTimes(1);
		const customer = { id: 42, billing: {}, shipping: {} };
		act(() => handle.set({ ready: true, result: { hits: [{ id: '42', record: customer }] } }));
		// Mutation: skip the resource's retry → it rethrows the old failure.
		expect(captured!.defaultCustomerResource.read()).toBe(customer);
	});

	it('releases its reader of the customers handle on unmount', () => {
		const counted = countedHandle();
		mockUseCollectionQueryHandle.mockReturnValue(counted.handle);
		let renderer: ReturnType<typeof create> | undefined;
		act(() => {
			renderer = create(<Harness />);
		});
		expect(counted.live).toBe(1);
		act(() => renderer!.unmount());
		expect(counted.live).toBe(0);
	});
});
