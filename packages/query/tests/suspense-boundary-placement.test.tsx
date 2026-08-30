/**
 * @jest-environment jsdom
 *
 * The rule every Suspense resource in this repo is placed by, in two runnable halves.
 *
 * `ObservableResource` subscribes in its constructor and `read()` throws a FRESH promise until
 * the first value lands, so a resource built during render is only safe while the component
 * that built it commits. When a component suspends before its subtree has ever committed,
 * React unwinds to the nearest boundary and throws the work-in-progress fibers away —
 * `useMemo`, `useState` and `useRef` alike — so the retry re-runs the factory, builds a new
 * resource, and that one suspends for exactly the reason its predecessor did. Each attempt
 * manufactures the condition that triggers the next one: a loop, not a load. That is the
 * Orders blank-body failure (#1707), where the loop ran 7,746 times in ~100 s on CI and the
 * screen never mounted.
 *
 * The two documented remedies:
 *
 *   1. Build the resource OUTSIDE the discardable render, in a module-level cache keyed by its
 *      inputs (React's own "cache" guidance; observable-hooks creates its resources in an
 *      `api.js` module). `store-list-resource.ts`, `engine-record-resource.ts`,
 *      `use-rejected-mutations.ts`, `use-unresolved-conflicts.ts`, `use-queued-emails.ts` and
 *      `use-image-attachment/index.web.ts` are that shape.
 *
 *   2. Put the `Suspense` boundary BETWEEN the creator and the reader, so the creator commits
 *      alongside the fallback and only the reader suspends. Every screen, select and provider
 *      in this repo is that shape.
 *
 * The second test below is the reference for remedy 2, and the first is what happens without
 * either: they are the fail-before and pass-after of every boundary move in this change.
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { Observable } from 'rxjs';

/** Emits one microtask after each subscribe — the shape of an RxDB query's first emission. */
function asyncSource(onSubscribe: () => void): Observable<string> {
	return new Observable<string>((subscriber) => {
		onSubscribe();
		void Promise.resolve().then(() => subscriber.next('value'));
	});
}

/** Lets every pending microtask (and the React retry it schedules) run. */
async function settle(cycles = 25) {
	for (let i = 0; i < cycles; i++) {
		await React.act(async () => {
			await Promise.resolve();
		});
	}
}

describe('a resource built INSIDE the boundary that suspends on it', () => {
	/**
	 * The real loop never ends, which is unusable as a test — `act` would flush forever. So
	 * this source is rigged to relent: the first four subscriptions emit asynchronously (the
	 * shape of a real query, and the shape that loops — the retry reads the new resource BEFORE
	 * its emission), and the fifth emits synchronously, which lets that attempt commit and
	 * turns the loop into a number. Five resources built for one mount is one per attempt:
	 * exactly the 1:1 ratio measured in the app on every navigation to Orders (#1707), where
	 * nothing relented and the screen never mounted at all.
	 */
	it('is rebuilt on every retry, once per attempt', async () => {
		const RELENTS_AT = 5;
		let subscribes = 0;
		const rigged = () =>
			new Observable<string>((subscriber) => {
				subscribes++;
				if (subscribes >= RELENTS_AT) {
					subscriber.next('value');
					return;
				}
				void Promise.resolve().then(() => subscriber.next('value'));
			});
		function CreatorAndReader() {
			const resource = React.useMemo(() => new ObservableResource(rigged()), []);
			return <div data-testid="reader">{useObservableSuspense(resource)}</div>;
		}
		render(
			<React.Suspense fallback={<div data-testid="fallback" />}>
				<CreatorAndReader />
			</React.Suspense>
		);
		await settle();

		expect((await screen.findByTestId('reader')).textContent).toBe('value');
		expect(subscribes).toBe(RELENTS_AT);
	});
});

describe('a resource built ABOVE the boundary that suspends on it', () => {
	/**
	 * Remedy 2, and the reason it works: React unwinds only as far as the BOUNDARY and commits
	 * everything above it alongside the fallback, so the creator's `useMemo` is preserved and
	 * the retry reads back the same resource. One subscription, however many attempts.
	 */
	it('is preserved across the retry, because the creator commits with the fallback', async () => {
		let subscribes = 0;
		function Reader({ resource }: { resource: ObservableResource<string> }) {
			return <div data-testid="reader">{useObservableSuspense(resource)}</div>;
		}
		function Creator() {
			const resource = React.useMemo(
				() => new ObservableResource(asyncSource(() => subscribes++)),
				[]
			);
			return (
				<React.Suspense fallback={<div data-testid="fallback" />}>
					<Reader resource={resource} />
				</React.Suspense>
			);
		}
		render(<Creator />);
		await settle();

		expect((await screen.findByTestId('reader')).textContent).toBe('value');
		expect(subscribes).toBe(1);
	});

	it('keeps the creator on screen while the reader waits', async () => {
		// What the boundary move buys the cashier: the pill or section that has not got its
		// records yet costs a fallback, never the screen around it. Escaping to expo-router's
		// per-route boundary — production fallback `null` — is how it became a blank body.
		function Reader({ resource }: { resource: ObservableResource<string> }) {
			return <div data-testid="reader">{useObservableSuspense(resource)}</div>;
		}
		function Creator() {
			const resource = React.useMemo(
				() =>
					new ObservableResource(
						new Observable<string>(() => {
							/* never emits */
						})
					),
				[]
			);
			return (
				<div>
					<div data-testid="sibling" />
					<React.Suspense fallback={<div data-testid="fallback" />}>
						<Reader resource={resource} />
					</React.Suspense>
				</div>
			);
		}
		render(
			<React.Suspense fallback={<div data-testid="route-fallback" />}>
				<Creator />
			</React.Suspense>
		);
		await settle();

		expect(screen.queryByTestId('route-fallback')).toBeNull();
		expect(screen.getByTestId('sibling')).toBeTruthy();
		expect(screen.getByTestId('fallback')).toBeTruthy();
	});
});
