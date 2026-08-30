/**
 * @jest-environment jsdom
 *
 * A Suspense resource built during render is only safe while the component that built it
 * commits. `ObservableResource` subscribes in its constructor and `read()` throws a FRESH
 * promise until the first value lands, so when a component suspends before its subtree has ever
 * committed — React unwinds to the boundary and throws the work-in-progress fibers away,
 * `useMemo`/`useState`/`useRef` included — the retry builds another resource that suspends for
 * exactly the reason its predecessor did. Each attempt manufactures the condition that triggers
 * the next one: a loop, not a load (monorepo#1707).
 *
 * The first test here is the control: it runs the fiber-held shape and counts the wreckage,
 * rather than waiting for a timeout to prove the point.
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { Observable } from 'rxjs';

import { useSuspenseResource } from '../src/suspense-resource';

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
	state = { error: null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	render() {
		return this.state.error ? <div data-testid="error">failed</div> : this.props.children;
	}
}

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

describe('a Suspense resource built during render', () => {
	/**
	 * The control, and the reason every fix in this change exists.
	 *
	 * The real loop never ends, which is unusable as a test — `act` would flush forever. So
	 * this source is rigged to relent: the first four subscriptions emit asynchronously (the
	 * shape of a real query, and the shape that loops — the retry reads the new resource
	 * BEFORE its emission), and the fifth emits synchronously, which lets that attempt commit
	 * and turns the loop into a number. Five resources built for one mount is one per attempt:
	 * exactly the 1:1 ratio measured in the app on every navigation to Orders (#1707), where
	 * nothing relented and the screen never mounted at all.
	 */
	it('is rebuilt on every retry when it is held on the fiber', async () => {
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
		function FiberHeld() {
			const resource = React.useMemo(() => new ObservableResource(rigged()), []);
			return <div data-testid="fiber-held">{useObservableSuspense(resource)}</div>;
		}
		render(
			<React.Suspense fallback={<div data-testid="fallback" />}>
				<FiberHeld />
			</React.Suspense>
		);
		await settle();

		expect((await screen.findByTestId('fiber-held')).textContent).toBe('value');
		expect(subscribes).toBe(RELENTS_AT);
	});
});

describe('a Suspense resource built ABOVE the boundary that suspends on it', () => {
	/**
	 * The other half of the rule, and the reason several sites in the app need no cache at all:
	 * `use-open-orders-resource` (built in `(pos)/_layout.tsx`, consumed under a `Suspense`),
	 * `use-order-refunds` (built in `RefundsResourceBoundary`, consumed under its `Suspense`),
	 * and the UI-settings provider (above every screen boundary).
	 *
	 * When the consumer suspends, React unwinds only as far as the BOUNDARY and commits
	 * everything above it alongside the fallback — so the builder's `useMemo` is preserved and
	 * the retry reads back the same resource. Only a builder that is INSIDE the boundary's
	 * subtree loses its state, which is why the fix for those sites is where the boundary sits,
	 * not a cache.
	 */
	it('is preserved across the retry, because the builder commits with the fallback', async () => {
		let subscribes = 0;
		function Consumer({ resource }: { resource: ObservableResource<string> }) {
			return <div data-testid="consumer">{useObservableSuspense(resource)}</div>;
		}
		function Builder() {
			const resource = React.useMemo(
				() => new ObservableResource(asyncSource(() => subscribes++)),
				[]
			);
			return (
				<React.Suspense fallback={<div data-testid="fallback" />}>
					<Consumer resource={resource} />
				</React.Suspense>
			);
		}
		render(<Builder />);
		await settle();

		expect((await screen.findByTestId('consumer')).textContent).toBe('value');
		expect(subscribes).toBe(1);
	});
});

describe('useSuspenseResource', () => {
	it('mounts on the first emission, having subscribed exactly once', async () => {
		const scope = {};
		let subscribes = 0;
		function Consumer() {
			const resource = useSuspenseResource(
				scope,
				'input',
				React.useMemo(() => asyncSource(() => subscribes++), [])
			);
			const value = useObservableSuspense(resource);
			return <div data-testid="consumer">{value}</div>;
		}
		render(
			<React.Suspense fallback={<div data-testid="fallback" />}>
				<Consumer />
			</React.Suspense>
		);
		await settle();

		expect((await screen.findByTestId('consumer')).textContent).toBe('value');
		// The retry read back the resource the first attempt already had in flight, so its
		// first emission ended the wait instead of starting the next one.
		expect(subscribes).toBe(1);
	});

	it('evicts an unclaimed resource that errors so a remount can retry', async () => {
		const scope = {};
		let subscribes = 0;
		const source$ = new Observable<string>((subscriber) => {
			subscribes++;
			if (subscribes === 1) subscriber.error(new Error('transient'));
			else subscriber.next('recovered');
		});
		function Consumer() {
			const resource = useSuspenseResource(scope, 'input', source$);
			return <div data-testid="consumer">{useObservableSuspense(resource)}</div>;
		}

		const failed = render(
			<ErrorBoundary>
				<Consumer />
			</ErrorBoundary>
		);
		await settle(2);
		expect(screen.getByTestId('error')).toBeTruthy();
		failed.unmount();

		render(
			<ErrorBoundary>
				<Consumer />
			</ErrorBoundary>
		);
		await settle(2);
		expect(screen.getByTestId('consumer').textContent).toBe('recovered');
		expect(subscribes).toBe(2);
	});

	it('preserves its claimed resource through Strict Mode replay', async () => {
		const scope = {};
		let subscribes = 0;
		let unsubscribes = 0;
		const source$ = new Observable<string>((subscriber) => {
			subscribes++;
			void Promise.resolve().then(() => subscriber.next('value'));
			return () => {
				unsubscribes++;
			};
		});
		function Consumer() {
			const resource = useSuspenseResource(scope, 'input', source$);
			return <div data-testid="consumer">{useObservableSuspense(resource)}</div>;
		}

		const view = render(
			<React.StrictMode>
				<React.Suspense fallback={<div data-testid="fallback" />}>
					<Consumer />
				</React.Suspense>
			</React.StrictMode>
		);
		await settle();
		expect(screen.getByTestId('consumer').textContent).toBe('value');
		expect(subscribes).toBe(1);
		expect(unsubscribes).toBe(0);

		view.unmount();
		await settle(2);
		expect(unsubscribes).toBe(1);
	});

	it('bridges one resource to every attempt, then lets exactly one reader own it', async () => {
		// Two consumers asking for the same thing share the bridged resource while they are
		// suspended — that sharing IS the retry surviving. Once they commit, only one can own
		// a resource it will reload and destroy on its own schedule, so the other builds its
		// own rather than reading someone else's subscription.
		const scope = {};
		const owned: ObservableResource<string>[] = [];
		function Consumer({ name }: { name: string }) {
			const resource = useSuspenseResource(
				scope,
				'input',
				React.useMemo(() => asyncSource(() => undefined), [])
			);
			const value = useObservableSuspense(resource);
			owned.push(resource);
			return <div data-testid={name}>{value}</div>;
		}
		render(
			<React.Suspense fallback={<div data-testid="fallback" />}>
				<Consumer name="one" />
				<Consumer name="two" />
			</React.Suspense>
		);
		await settle();

		expect((await screen.findByTestId('one')).textContent).toBe('value');
		expect((await screen.findByTestId('two')).textContent).toBe('value');
		// Both mounted: neither was left holding a resource its owner had destroyed.
		expect(owned.length).toBeGreaterThan(1);
	});

	it('does not share a resource between keys, or between scopes', async () => {
		const scopeA = {};
		const scopeB = {};
		const source$ = asyncSource(() => undefined);
		const seen = new Map<string, unknown>();
		function Consumer({ scope, name }: { scope: object; name: string }) {
			seen.set(name, useSuspenseResource(scope, name.slice(0, 1), source$));
			return null;
		}
		render(
			<>
				<Consumer scope={scopeA} name="a-in-A" />
				<Consumer scope={scopeA} name="b-in-A" />
				<Consumer scope={scopeB} name="a-in-B" />
			</>
		);
		await settle(2);

		expect(seen.get('a-in-A')).not.toBe(seen.get('b-in-A'));
		expect(seen.get('a-in-A')).not.toBe(seen.get('a-in-B'));
	});

	it('destroys the resource when its owner unmounts', async () => {
		const scope = {};
		let subscribes = 0;
		let unsubscribes = 0;
		const source$ = new Observable<string>((subscriber) => {
			subscribes++;
			subscriber.next('value');
			return () => {
				unsubscribes++;
			};
		});
		const captured: ObservableResource<string>[] = [];
		function Consumer() {
			const resource = useSuspenseResource(scope, 'input', source$);
			captured.push(resource);
			return <div data-testid="consumer">{useObservableSuspense(resource)}</div>;
		}
		const view = render(<Consumer />);
		await settle(2);
		expect(subscribes).toBe(1);

		await React.act(async () => {
			view.unmount();
		});
		expect(unsubscribes).toBe(1);
		expect(captured[0].isDestroyed).toBe(true);

		// And the entry is gone, so the next mount gets a live resource rather than the
		// destroyed one (whose `read()` throws "Resource has been destroyed").
		render(<Consumer />);
		await settle(2);
		expect(subscribes).toBe(2);
		expect(captured[captured.length - 1].isDestroyed).toBe(false);
	});

	it('reloads in place when the input identity moves, keeping the value on screen', async () => {
		const scope = {};
		const source = (value: string) =>
			new Observable<string>((subscriber) => {
				// Async, so a rebuilt resource would suspend and blank the consumer.
				void Promise.resolve().then(() => subscriber.next(value));
			});
		const resources: ObservableResource<string>[] = [];
		function Consumer({ term }: { term: string }) {
			const resource = useSuspenseResource(
				scope,
				term,
				React.useMemo(() => source(term), [term])
			);
			resources.push(resource);
			return <div data-testid="consumer">{useObservableSuspense(resource)}</div>;
		}
		const view = render(
			<React.Suspense fallback={<div data-testid="fallback" />}>
				<Consumer term="a" />
			</React.Suspense>
		);
		await settle();
		expect(screen.getByTestId('consumer').textContent).toBe('a');

		await React.act(async () => {
			view.rerender(
				<React.Suspense fallback={<div data-testid="fallback" />}>
					<Consumer term="b" />
				</React.Suspense>
			);
		});
		// Same resource object throughout — a new one would have suspended, and the fallback
		// would have replaced the grid on a keystroke.
		expect(new Set(resources).size).toBe(1);
		expect(screen.queryByTestId('fallback')).toBeNull();
		await settle();
		expect(screen.getByTestId('consumer').textContent).toBe('b');
	});

	it('bounds the bridge, and never touches a resource a reader already owns', async () => {
		const scope = {};
		const settled$ = new Observable<string>((subscriber) => subscriber.next('value'));
		function Owner() {
			const resource = useSuspenseResource(scope, 'owner', settled$);
			return <div data-testid="owner">{useObservableSuspense(resource)}</div>;
		}
		const view = render(<Owner />);
		await settle(2);

		// A render that never COMMITS leaves a bridge entry nobody will ever claim — and that
		// is exactly the entry a retry depends on finding, so it cannot be dropped eagerly.
		// The eviction bound is the only thing standing between a long session and a map that
		// grows forever.
		const orphans: ObservableResource<string>[] = [];
		function Orphan({ index }: { index: number }) {
			const resource = useSuspenseResource(
				scope,
				`orphan-${index}`,
				React.useMemo(
					() =>
						new Observable<string>(() => {
							/* never emits, so this consumer never commits */
						}),
					[]
				)
			);
			orphans.push(resource);
			return <div>{useObservableSuspense(resource)}</div>;
		}
		for (let index = 0; index < 200; index++) {
			const orphan = render(
				<React.Suspense fallback={null}>
					<Orphan index={index} />
				</React.Suspense>
			);
			await React.act(async () => {
				orphan.unmount();
			});
		}

		expect(orphans.filter((resource) => resource.isDestroyed).length).toBeGreaterThan(0);
		// The owner claimed its resource out of the bridge, so eviction could never reach it:
		// it is still live and still being served.
		expect(view.getByTestId('owner').textContent).toBe('value');
	});
});
