/**
 * @jest-environment jsdom
 *
 * The #40 / #832 panel hang, reproduced through the REAL hook + REAL
 * ObservableResource + a real React.Suspense boundary.
 *
 * The live diagnostic (smoke-batch-3) proved the data path is fine: the rejected
 * query resolves length 1, the resident read resolves, and a raw subscription to
 * the query observable emits. Yet the panel spins forever. The fault is the
 * ObservableResource LIFECYCLE: it was built in `useMemo` during render and torn
 * down in a `useEffect` cleanup, but a component that SUSPENDS never commits — so
 * every Suspense retry gets a freshly-constructed resource that suspends again on
 * its own async first emission, forever.
 *
 * This test drives that exact shape: the named described-rows read resolves on a microtask —
 * so the full pipeline's first value is asynchronous and the panel suspends
 * before it can commit. With the bug the row never appears; with the fix it does.
 */
import * as React from 'react';

import { act, render, waitFor } from '@testing-library/react';
import { defer, throwError } from 'rxjs';

import { useRejectedMutations } from './use-rejected-mutations';

let engineStub: unknown;

jest.mock('@wcpos/query', () => ({
	REJECTED_QUEUE_STATUSES: ['rejected'],
	observeDescribedQueueRows: (engine: { read: () => unknown }) => engine.read(),
	useQueryRuntime: () => ({ engine: engineStub }),
}));

const UUID_A = '070ef836-0d14-4109-ac2b-c35a96b2d1c6';

const deadLetterRow = {
	mutationId: '29956306-c66c-4d4e-a3cd-753440de79b1',
	collectionName: 'orders',
	operation: 'create' as const,
	recordId: UUID_A,
	origin: 'existing' as const,
	payload: { status: 'pos-open' },
	baseRevision: null,
	queuedAt: '2026-08-06T16:01:10.000Z',
	status: 'rejected' as const,
	rejectedStatus: 400,
	rejectedReason: 'rest_invalid_param',
	rejectedMessage: 'Invalid parameter(s): billing — SMOKE-B forced permanent rejection',
	rejectedAt: '2026-08-06T16:01:11.000Z',
};

/** Preserve the named read's async first emission, so React really suspends. */
function makeEngine(options: { residentRead?: 'failed'; queryErrors?: boolean } = {}) {
	let subscribeCount = 0;
	const engine = {
		read: () =>
			defer(() => {
				subscribeCount += 1;
				if (options.queryErrors) return throwError(() => new Error('storage query failed'));
				return Promise.resolve([
					{
						...deadLetterRow,
						resident: options.residentRead === 'failed' ? null : { total: '25.00' },
						residentRead: options.residentRead === 'failed' ? 'failed' : 'ok',
						discard: options.residentRead === 'failed' ? 'unknown' : 'destroys-record',
					},
				]);
			}),
	};
	return { engine, subscriptions: () => subscribeCount };
}

function Probe() {
	const { rows, readError } = useRejectedMutations();
	return (
		<div data-testid="rows">
			{readError ? 'READ-ERROR' : rows.map((r) => r.mutationId).join(',') || 'EMPTY'}
		</div>
	);
}

describe('RejectedMutationsPanel Suspense lifecycle (#40/#832)', () => {
	it('renders the dead-letter row instead of suspending forever', async () => {
		const { engine } = makeEngine();
		engineStub = engine;

		const screen = render(
			<React.Suspense fallback={<div data-testid="spinner">loading</div>}>
				<Probe />
			</React.Suspense>
		);

		// Let every retry / microtask settle. With the bug the resource is rebuilt
		// on each Suspense retry and this never resolves.
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 150));
		});
		await waitFor(() => expect(screen.queryByTestId('rows')).not.toBeNull(), { timeout: 4000 });
		expect(screen.getByTestId('rows').textContent).toContain(deadLetterRow.mutationId);
	}, 20000);

	it('renders the row even when the resident read FAILS — never a hang', async () => {
		const { engine } = makeEngine({
			residentRead: 'failed',
		});
		engineStub = engine;

		const screen = render(
			<React.Suspense fallback={<div data-testid="spinner">loading</div>}>
				<Probe />
			</React.Suspense>
		);

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 150));
		});
		await waitFor(() => expect(screen.queryByTestId('rows')).not.toBeNull(), { timeout: 4000 });
		expect(screen.getByTestId('rows').textContent).toContain(deadLetterRow.mutationId);
	}, 20000);

	it('degrades to a visible read-error when the query stream ERRORS — never poisons the cache', async () => {
		// The resource is cached for the engine's life, so a stream error must not
		// latch into `ObservableResource` and throw on every future render. The
		// pipeline's catchError degrades to a NON-throwing read-error emission: the
		// screen stays usable, and the cashier is told the panel could not be read
		// instead of seeing a silent empty state (cashier-full-information ruling).
		const { engine } = makeEngine({ queryErrors: true });
		engineStub = engine;

		const screen = render(
			<React.Suspense fallback={<div data-testid="spinner">loading</div>}>
				<Probe />
			</React.Suspense>
		);

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 150));
		});
		await waitFor(() => expect(screen.queryByTestId('rows')).not.toBeNull(), { timeout: 4000 });
		expect(screen.getByTestId('rows').textContent).toBe('READ-ERROR');
	}, 20000);
});
