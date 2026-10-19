/** @jest-environment jsdom */
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { defer, type Observable, Subject } from 'rxjs';

import {
	createEngineDatabase,
	createFakeEngine,
	type FakeEngine,
	queryHandleCount,
} from '@wcpos/query/testing';
import type { QueryHandle } from '@wcpos/query';
import type { RequirementHandle } from '@wcpos/sync-engine';
import { useQuerySnapshot } from '@wcpos/query/query-state';

import { RefundsBoundary } from './refunds-boundary';
import { useOrderRefunds } from './use-order-refunds';

import type { RxDatabase } from 'rxdb';

Object.assign(globalThis, { TextDecoder, TextEncoder });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });

// The REAL handle over a fake engine and a real engine-schema database: only the runtime is
// injected, and the local read can be swapped per test to fail.
let mockRuntime: { engine: FakeEngine };
const mockObserve = jest.fn();
const mockOrder = {
	uuid: 'order-uuid',
	payload: { id: 23858, status: 'completed', currency_symbol: '$', refunds: [{ id: 99 }] },
};

jest.mock('../../../../../../query/src/provider', () => ({
	...jest.requireActual('../../../../../../query/src/provider'),
	useQueryRuntime: () => mockRuntime,
}));
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useRecordField: (record: typeof mockOrder, select: (record: typeof mockOrder) => unknown) =>
		select(record),
	observeEngineQuery: (...args: unknown[]) => mockObserve(...args),
}));
const actualObserve = jest.requireActual('@wcpos/query').observeEngineQuery;
jest.mock('react-native', () => ({
	ScrollView: ({ children }: any) => <div data-testid="modal-scroll">{children}</div>,
	View: ({ children }: any) => <div>{children}</div>,
	useWindowDimensions: () => ({ width: 1024 }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children }: any) => <button type="button">{children}</button>,
	ButtonText: ({ children }: any) => <span>{children}</span>,
}));
// The real `react-error-boundary` (it forwards `onReset` and `resetKeys`): the app's wrapper
// pulls the icon package's ESM, which CI's Node 22 cannot load unmocked.
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: jest.requireActual('react-error-boundary').ErrorBoundary,
}));
// Stands in for the real section at the one thing that matters here: it reads the handle
// `RefundsResourceBoundary` hands it, exactly as the section does (and suspends on it).
jest.mock('./sections/refunds', () => {
	const { useQuerySnapshot: read } = jest.requireActual(
		'@wcpos/query/query-state'
	) as typeof import('@wcpos/query/query-state');
	return {
		RefundsFallback: ({ onRetry }: { onRetry: () => void }) => (
			<button data-testid="refunds-fallback" onClick={onRetry} />
		),
		RefundsSkeleton: () => <div data-testid="refunds-skeleton" />,
		RefundsSection: ({ handle }: { handle: QueryHandle }) => {
			const { hits } = read(handle, ['hits']);
			return (
				<div data-testid="refunds-section">
					{hits.map(({ record }) => (record.payload as { id: number }).id).join(',')}
				</div>
			);
		},
	};
});
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

let engineDB: RxDatabase;
let engine: FakeEngine;

/** Lets every pending microtask (and the React retry it schedules) run. */
async function settle() {
	for (let i = 0; i < 25; i++) {
		await React.act(async () => {
			await Promise.resolve();
		});
	}
}

/** A refund for `parent`, dated so that a higher id is newer (and its uuid sorts later). */
function refund(id: number, parent = 23858) {
	return {
		uuid: `woo-refund:${id}`,
		remoteId: String(id),
		sessionId: '',
		payload: {
			id,
			parent_id: parent,
			date_created_gmt: `2026-09-${String(id).padStart(2, '0')}T00:00:00`,
			meta_data: [],
		},
		local: { dirty: false, pendingMutationIds: [] },
		sync: { revision: '', partial: false, source: 'woo-rest' },
	};
}
const insert = (...ids: number[]) =>
	React.act(async () => {
		await engineDB.collections.refunds.bulkInsert(ids.map((id) => refund(id)));
	});
const section = () => screen.getByTestId('refunds-section').textContent;
const byParent = () => engine.requireCalls.filter(({ kind }) => kind === 'refunds-by-parent');
/** Every declaration from now on stays in flight: the demand never settles. */
function neverSettle() {
	const require = engine.require.bind(engine);
	engine.require = (requirement) =>
		({ ...require(requirement), ready: new Promise(() => {}) }) as RequirementHandle;
}

beforeEach(async () => {
	engineDB = await createEngineDatabase(['refunds', 'orders']);
	engine = createFakeEngine(engineDB);
	mockRuntime = { engine };
	mockObserve.mockReset().mockImplementation(actualObserve);
});
afterEach(async () => {
	await settle();
	if (!engineDB.destroyed) await engineDB.remove();
});

const show = () =>
	render(
		<React.Suspense fallback={<div data-testid="route-fallback" />}>
			<RefundsBoundary order={mockOrder.payload} orderUuid={mockOrder.uuid} orderId={23858} />
		</React.Suspense>
	);

describe('local-first live order refunds', () => {
	it('an order switch never commits the previous order’s rows', async () => {
		await React.act(async () => {
			await engineDB.collections.refunds.bulkInsert([refund(1, 42), refund(2, 43)]);
		});
		const committed: [number, number[]][] = [];
		function Rows({ orderId, handle }: { orderId: number; handle: QueryHandle }) {
			const { hits } = useQuerySnapshot(handle, ['hits']);
			React.useLayoutEffect(() => {
				committed.push([orderId, hits.map(({ record }) => Number(record.payload.id))]);
			});
			return null;
		}
		function Owner({ orderId }: { orderId: number }) {
			const handle = useOrderRefunds(orderId);
			return (
				<React.Suspense fallback={null}>
					<Rows orderId={orderId} handle={handle} />
				</React.Suspense>
			);
		}
		const view = render(<Owner orderId={42} />);
		await waitFor(() => expect(committed).toContainEqual([42, [1]]));
		view.rerender(<Owner orderId={43} />);
		await waitFor(() => expect(committed).toContainEqual([43, [2]]));
		// Drop `orderId` from the handle's key and order 43 commits 42's handle: [43, [1]].
		expect(committed.filter(([orderId]) => orderId === 43)).toEqual(
			expect.not.arrayContaining([[43, [1]]])
		);
	});

	it('keeps yielding live refunds after StrictMode effect replay and releases on unmount', async () => {
		const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const view = render(
				<React.StrictMode>
					<React.Suspense fallback={<div data-testid="route-fallback" />}>
						<RefundsBoundary order={mockOrder.payload} orderUuid={mockOrder.uuid} orderId={23858} />
					</React.Suspense>
				</React.StrictMode>
			);
			await insert(1, 2);
			await waitFor(() => expect(section()).toBe('2,1'));
			// The replayed retain keeps the read live: drop the read's restart and this stalls.
			await insert(3);
			await waitFor(() => expect(section()).toBe('3,2,1'));
			expect(screen.queryByTestId('refunds-fallback')).toBeNull();
			expect(errors.mock.calls.flat().map(String).join(' ')).not.toMatch(/destroyed/i);
			view.unmount();
			await settle();
			// Return nothing from the retain effect (`() => { handle.retain(); }`) and the
			// handle is never stopped: the registry keeps it.
			expect(queryHandleCount(engine)).toBe(0);
		} finally {
			errors.mockRestore();
		}
	});

	it('contains local loading and renders sorted rows while the demand never settles', async () => {
		neverSettle();
		await insert(1, 2);
		show();
		expect(screen.getByTestId('refunds-skeleton')).toBeTruthy();
		expect(screen.queryByTestId('route-fallback')).toBeNull();
		// Drop the read's `sort` and the engine answers in uuid order: '1,2'.
		await waitFor(() => expect(section()).toBe('2,1'));
		// Drop the `parent_id` selector (or the demand) and these fail.
		expect(mockObserve).toHaveBeenCalledWith(
			engine,
			expect.objectContaining({ collection: 'refunds', selector: { parent_id: 23858 } })
		);
		expect(byParent()).toHaveLength(1);
		// Drop `forceRefresh: true` from the plan and this fails.
		expect(byParent()[0]).toEqual(
			expect.objectContaining({ parentRemoteId: '23858', forceRefresh: true })
		);
	});

	it.each([{ ids: [1] }, { ids: [] }])(
		'refresh failure retains the local result %j, never the summary fallback',
		async ({ ids }) => {
			const require = engine.require.bind(engine);
			engine.require = (requirement) => {
				const ready = Promise.reject(new Error('offline'));
				ready.catch(() => undefined);
				return { ...require(requirement), ready } as RequirementHandle;
			};
			if (ids.length) await insert(...ids);
			show();
			await settle();
			// A demand failure that reached the read would draw the fallback instead.
			expect(section()).toBe(ids.join(','));
			expect(screen.queryByTestId('refunds-fallback')).toBeNull();
		}
	);

	it('reflects live inserts and deletions and releases the local read and the demand', async () => {
		const view = show();
		await insert(1);
		await waitFor(() => expect(section()).toBe('1'));
		await insert(3);
		await waitFor(() => expect(section()).toBe('3,1'));
		await React.act(async () => {
			await engineDB.collections.refunds.find().remove();
		});
		await waitFor(() => expect(section()).toBe(''));
		view.unmount();
		await settle();
		// Drop the retain effect's cleanup and neither the read nor the demand is released.
		expect(engine.demandEvents.at(-1)).toBe('release:refunds-by-parent');
		expect(queryHandleCount(engine)).toBe(0);
	});

	it('local read failure shows the summary fallback; Retry restarts the read and re-declares forcibly', async () => {
		const silence = jest.spyOn(console, 'error').mockImplementation(() => {});
		const failing = new Subject<never>();
		let attempts = 0;
		mockObserve.mockImplementationOnce((target: unknown, descriptor: unknown) =>
			defer(() =>
				attempts++ === 0 ? failing : (actualObserve(target, descriptor) as Observable<never>)
			)
		);
		try {
			await insert(4);
			const view = show();
			await settle();
			await React.act(async () => failing.error(new Error('local read failed')));
			expect(screen.getByTestId('refunds-fallback')).toBeTruthy();
			expect(byParent()).toHaveLength(1);
			// From here every declaration stays in flight: the Retry's pull never settles on its own.
			neverSettle();
			fireEvent.click(screen.getByTestId('refunds-fallback'));
			// Drop `handle.retry()` from `onReset` and the section rethrows the old failure.
			await waitFor(() => expect(section()).toBe('4'));
			expect(attempts).toBe(2);
			// Drop `handle.declareOnce()` from `onReset` and no second pull is asked for.
			await waitFor(() => expect(byParent()).toHaveLength(2));
			expect(byParent()[1].forceRefresh).toBe(true);
			view.unmount();
			await settle();
			// Drop the abort on unmount and the Retry's pull runs on: one release, not two.
			expect(
				engine.demandEvents.filter((event) => event === 'release:refunds-by-parent')
			).toHaveLength(2);
		} finally {
			silence.mockRestore();
		}
	});

	it('redeclares a forced by-parent pull, before the old releases, when only the orders collection is reset', async () => {
		show();
		await waitFor(() => expect(section()).toBe(''));
		// A status tick that moves no generation is the same handle.
		await React.act(async () => engine.setCollectionStatus('orders', { active: false }));
		expect(byParent()).toHaveLength(1);
		await React.act(async () => engine.setCollectionStatus('orders', { coverageGeneration: 1 }));
		await settle();
		// Drop `useScopeKey('orders')` from the key and the reset declares nothing.
		expect(engine.demandEvents).toEqual([
			'require:refunds-by-parent',
			'require:refunds-by-parent',
			'release:refunds-by-parent',
		]);
		expect(byParent()[1]).toEqual(
			expect.objectContaining({
				kind: 'refunds-by-parent',
				collection: 'refunds',
				parentRemoteId: '23858',
				forceRefresh: true,
			})
		);
	});

	it('reopening or resetting the refunds collection declares a fresh forced pull', async () => {
		neverSettle();
		const first = show();
		await waitFor(() => expect(section()).toBe(''));
		first.unmount();
		await settle();
		show();
		await waitFor(() => expect(section()).toBe(''));
		// A remount after the handle stopped is a new handle: it declares again.
		expect(byParent()).toHaveLength(2);
		const before = engine.demandEvents.length;
		await React.act(async () => engine.setCollectionStatus('refunds', { coverageGeneration: 1 }));
		await settle();
		// Drop `useScopeKey('refunds')` from the key and the reset declares nothing.
		expect(engine.demandEvents.slice(before)).toEqual([
			'require:refunds-by-parent',
			'release:refunds-by-parent',
		]);
		expect(byParent()).toHaveLength(3);
		expect(byParent().every(({ forceRefresh }) => forceRefresh)).toBe(true);
	});
});
