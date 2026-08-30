/**
 * @jest-environment jsdom
 *
 * A consumer that suspends on an engine record must mount on the record's FIRST emission.
 *
 * `ObservableResource` subscribes in its constructor and `read()` throws a fresh promise
 * until the first value lands, so a resource built during render — in `useMemo`, `useState`
 * or `useRef`, all of which live on the fiber React throws away when a component suspends
 * before it has ever committed — is rebuilt by every Suspense retry, and the rebuilt
 * resource suspends for exactly the reason its predecessor did. Each attempt manufactures
 * the next one. That is the Orders blank-body failure (#1707); these three hooks carried the
 * same shape, and an engine record's first emission is always asynchronous.
 *
 * Separate from `use-engine-document.test.tsx` because that file reads resources directly
 * through `renderHook` and its fake queries emit synchronously, so nothing there can ever
 * suspend. These tests keep a boundary and an async source in the picture: the loop is only
 * visible as a COUNT of subscriptions to the underlying query, one per resource built.
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { useObservableSuspense } from 'observable-hooks';
import { Observable } from 'rxjs';

import {
	useEngineRecord,
	useEngineRecordByWooId,
	useEngineRecordsByWooId,
} from './use-engine-document';

type FakeRecord = { uuid: string; remoteId: string | null };

/** Subscriptions to a record query — one per `ObservableResource` ever built. */
let querySubscriptions = 0;

/** Emits one microtask after each subscribe — the shape of a live RxDB query. */
function asyncQuery<T>(value: T): Observable<T> {
	return new Observable<T>((subscriber) => {
		querySubscriptions += 1;
		void Promise.resolve().then(() => subscriber.next(value));
	});
}

const coffee: FakeRecord = { uuid: 'product-uuid', remoteId: '42' };
const tools: FakeRecord = { uuid: 'category-12', remoteId: '12' };

const database = {
	collections: {
		products: { findOne: () => ({ $: asyncQuery<FakeRecord | null>(coffee) }) },
		customers: { findOne: () => ({ $: asyncQuery<FakeRecord | null>(coffee) }) },
		categories: { find: () => ({ $: asyncQuery<FakeRecord[]>([tools]) }) },
	},
};

const engine = {
	active: () => ({ database }),
	ready: Promise.resolve(undefined),
	db$: () => () => undefined,
};

jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useQueryRuntime: () => ({ engine }),
}));

/** Lets every pending microtask (and the React retry it schedules) run. */
const settle = async () => {
	for (let i = 0; i < 25; i++) {
		await React.act(async () => {
			await Promise.resolve();
		});
	}
};

function RecordByUuid({ uuid }: { uuid: string }) {
	const record = useObservableSuspense(useEngineRecord('products', uuid));
	return <div data-testid="record">{record?.uuid ?? 'none'}</div>;
}

function RecordByWooId({ wooId }: { wooId: number }) {
	const record = useObservableSuspense(useEngineRecordByWooId('customers', wooId));
	return <div data-testid="record">{record?.uuid ?? 'none'}</div>;
}

function RecordsByWooId({ wooIds }: { wooIds: number[] }) {
	const records = useObservableSuspense(useEngineRecordsByWooId('categories', wooIds));
	return <div data-testid="record">{records.map((record) => record.uuid).join(',')}</div>;
}

const renderSuspending = (children: React.ReactNode) =>
	render(<React.Suspense fallback={<div data-testid="fallback" />}>{children}</React.Suspense>);

beforeEach(() => {
	querySubscriptions = 0;
});

describe.each([
	['useEngineRecord', <RecordByUuid key="a" uuid="product-uuid" />, 'product-uuid'],
	['useEngineRecordByWooId', <RecordByWooId key="b" wooId={42} />, 'product-uuid'],
	['useEngineRecordsByWooId', <RecordsByWooId key="c" wooIds={[12]} />, 'category-12'],
] as const)('%s under a Suspense boundary', (_name, element, expected) => {
	it('mounts on the first emission, having subscribed the query exactly once', async () => {
		// The retry loop is only visible as a COUNT: each attempt built its own resource, and
		// each resource subscribed the query again. One subscription means the second attempt
		// read back the resource the first one already had in flight, which is what lets the
		// first emission end the wait instead of starting the next one.
		renderSuspending(element);
		expect(screen.getByTestId('fallback')).toBeTruthy();

		await settle();

		expect((await screen.findByTestId('record')).textContent).toBe(expected);
		expect(querySubscriptions).toBe(1);
	});
});

describe('engine record resource identity', () => {
	it('gives two consumers of the same record one resource, and one subscription', async () => {
		renderSuspending(
			<>
				<RecordByUuid uuid="product-uuid" />
				<RecordByUuid uuid="product-uuid" />
			</>
		);
		await settle();

		expect(await screen.findAllByTestId('record')).toHaveLength(2);
		expect(querySubscriptions).toBe(1);
	});

	it('does not share a resource between different records', async () => {
		renderSuspending(
			<>
				<RecordByUuid uuid="product-uuid" />
				<RecordByUuid uuid="another-uuid" />
			</>
		);
		await settle();

		expect(await screen.findAllByTestId('record')).toHaveLength(2);
		expect(querySubscriptions).toBe(2);
	});
});
