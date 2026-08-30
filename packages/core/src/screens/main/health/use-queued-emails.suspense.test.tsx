/**
 * @jest-environment jsdom
 *
 * `use-rejected-mutations` claims this hook "gets away with" a `useMemo` resource because its
 * observable emits `of([])` synchronously while the collection is undefined. That is only true
 * on a cold boot. Open Store Health with a store database already mounted — the ordinary way a
 * merchant gets here — and `queued$` takes the live `find().$` path, whose first emission is
 * async: the panel then suspends before it has ever committed, React discards the `useMemo`
 * with the aborted render, and every retry builds a resource that suspends for exactly the
 * reason its predecessor did. A loop, not a load (#1707).
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { Observable } from 'rxjs';

import { useQueuedEmails } from './use-queued-emails';

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
	state = { error: null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	render() {
		return this.state.error ? <div data-testid="error">failed</div> : this.props.children;
	}
}

let subscribeCount = 0;
let collection: unknown;

jest.mock('../receipt/email-queue/use-receipt-email-queue-collection', () => ({
	useReceiptEmailQueueCollection: () => collection,
}));

/** One row, one microtask after each subscribe — the shape of a live RxDB `find().$`. */
function asyncQueueCollection() {
	return {
		find: () => ({
			$: new Observable<unknown[]>((subscriber) => {
				subscribeCount++;
				void Promise.resolve().then(() =>
					subscriber.next([
						{
							localID: 'queued-1',
							orderId: 12,
							email: 'ada@example.com',
							status: 'pending',
							queuedAt: '2026-08-30T00:00:00.000Z',
							attempts: 1,
						},
					])
				);
			}),
		}),
	};
}

function Panel() {
	const rows = useQueuedEmails();
	return <div data-testid="queued-panel">{rows.length}</div>;
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
});

describe('the queued-emails panel on a store that already has a database', () => {
	it('mounts on the first emission, having subscribed the queue exactly once', async () => {
		collection = asyncQueueCollection();
		render(
			<React.Suspense fallback={<div data-testid="fallback" />}>
				<Panel />
			</React.Suspense>
		);
		await settle();

		expect((await screen.findByTestId('queued-panel')).textContent).toBe('1');
		// One subscription across every attempt: the retry read back the resource the first
		// attempt already had in flight, so its emission ended the wait rather than starting
		// the next attempt.
		expect(subscribeCount).toBe(1);
	});

	it('serves the same resource to every reader of a collection', async () => {
		// Keyed on the collection, so the panel and anything else reading the same queue share
		// one live subscription — and a store switch (a different collection) gets its own.
		collection = asyncQueueCollection();
		render(
			<React.Suspense fallback={<div data-testid="fallback" />}>
				<Panel />
				<Panel />
			</React.Suspense>
		);
		await settle();

		expect(await screen.findAllByTestId('queued-panel')).toHaveLength(2);
		expect(subscribeCount).toBe(1);
	});

	it('re-subscribes after a transient queue error and remount', async () => {
		collection = {
			find: () => ({
				$: new Observable<unknown[]>((subscriber) => {
					subscribeCount++;
					if (subscribeCount === 1) subscriber.error(new Error('transient'));
					else subscriber.next([]);
				}),
			}),
		};
		const failed = render(
			<ErrorBoundary>
				<Panel />
			</ErrorBoundary>
		);
		await settle();
		expect(screen.getByTestId('error')).toBeTruthy();
		failed.unmount();

		render(
			<ErrorBoundary>
				<Panel />
			</ErrorBoundary>
		);
		await settle();
		expect(screen.getByTestId('queued-panel').textContent).toBe('0');
		expect(subscribeCount).toBe(2);
	});

	it('reports an empty queue rather than suspending when there is no store database', async () => {
		// The cold-boot path the old comment described, kept working: `of([])` is synchronous,
		// so the panel commits on its first render and never reaches the fallback.
		collection = undefined;
		render(
			<React.Suspense fallback={<div data-testid="fallback" />}>
				<Panel />
			</React.Suspense>
		);
		await settle();

		expect(screen.getByTestId('queued-panel').textContent).toBe('0');
		expect(screen.queryByTestId('fallback')).toBeNull();
	});
});
