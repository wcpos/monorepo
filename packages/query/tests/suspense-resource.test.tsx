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

/** Emits one microtask after each subscribe — the shape of an RxDB query's first emission. */
function asyncSource(onSubscribe: () => void): Observable<string> {
	return new Observable<string>((subscriber) => {
		onSubscribe();
		void Promise.resolve().then(() => subscriber.next('value'));
	});
}

/**
 * Lets a scheduled teardown run. `useSuspenseResource` defers destruction by a macrotask so a
 * replayed effect setup can take its own teardown back (see `pendingTeardowns`), so a real
 * unmount releases the subscription one tick later, not synchronously.
 */
async function flushTeardown() {
	await React.act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
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

/** Catches what `read()` rethrows once a resource has latched an error. */
class Boundary extends React.Component<{ children: React.ReactNode }, { message: string | null }> {
	state: { message: string | null } = { message: null };

	static getDerivedStateFromError(error: Error) {
		return { message: error.message };
	}

	render() {
		if (this.state.message !== null) {
			return <div data-testid="boundary">{this.state.message}</div>;
		}
		return this.props.children;
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

	/*
	 * A third eviction test lived here — the same claim as the two in "a bridged resource whose
	 * stream fails" below, but with the source erroring SYNCHRONOUSLY inside the
	 * `ObservableResource` constructor. It was removed because it can only pass when the code is
	 * worse: a synchronous throw errors the render itself, React recovers by re-rendering the
	 * root, and it reports that recovery (`onRecoverableError`), which `act` turns into a test
	 * failure. That report fires only when the retry SUCCEEDS — i.e. only once the failed entry
	 * is actually dropped. Keeping the failed resource cached suppresses it, so the test rewarded
	 * the bug. The asynchronous variants below pin the same behaviour, and match how a live RxDB
	 * query actually fails.
	 */
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
		// Both mounted with distinct resources: neither holds one its owner destroyed.
		expect(new Set(owned).size).toBe(2);
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
		await flushTeardown();
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

describe('a bridged resource whose stream fails', () => {
	/**
	 * `ObservableResource` LATCHES an error: `read()` rethrows it forever. A stream that fails
	 * before its first value — a transient storage fault, a database closing under the query —
	 * therefore poisons the bridge slot, because the consumer never commits and so never claims
	 * the entry out of it. Resetting the error boundary or remounting the route would read the
	 * same dead resource straight back, and the screen could not recover until 32 unrelated
	 * entries pushed it out. Same class as `engine-record-resource` (#1710).
	 */
	it('is dropped, so the very next attempt resubscribes and the screen recovers', async () => {
		const scope = {};
		let subscribes = 0;
		const source$ = new Observable<string>((subscriber) => {
			subscribes++;
			const attempt = subscribes;
			void Promise.resolve().then(() => {
				if (attempt === 1) subscriber.error(new Error('storage fault'));
				else subscriber.next('value');
			});
		});
		function Consumer() {
			const resource = useSuspenseResource(scope, 'poisoned', source$);
			return <div data-testid="consumer">{useObservableSuspense(resource)}</div>;
		}
		const first = render(
			<Boundary>
				<React.Suspense fallback={<div data-testid="fallback" />}>
					<Consumer />
				</React.Suspense>
			</Boundary>
		);
		await settle();

		// On the old code the error boundary is showing 'storage fault': the failed resource
		// stayed in the bridge, so the Suspense retry read the same latched error straight back
		// and nothing could clear it. Dropping the entry turns that retry into a recovery.
		expect(screen.queryByTestId('boundary')).toBeNull();
		expect((await screen.findByTestId('consumer')).textContent).toBe('value');
		expect(subscribes).toBe(2);

		// And a later mount gets a live resource too, rather than the dead one.
		await React.act(async () => {
			first.unmount();
		});
		await flushTeardown();
		render(
			<Boundary>
				<React.Suspense fallback={<div data-testid="fallback" />}>
					<Consumer />
				</React.Suspense>
			</Boundary>
		);
		await settle();

		expect(screen.queryByTestId('boundary')).toBeNull();
		expect((await screen.findByTestId('consumer')).textContent).toBe('value');
	});

	it('is dropped when the stream completes without ever emitting, too', async () => {
		// `ObservableResource` turns that into "Suspender ended unexpectedly" — the same latch.
		const scope = {};
		let subscribes = 0;
		const source$ = new Observable<string>((subscriber) => {
			subscribes++;
			const attempt = subscribes;
			void Promise.resolve().then(() => {
				if (attempt === 1) subscriber.complete();
				else subscriber.next('value');
			});
		});
		function Consumer() {
			const resource = useSuspenseResource(scope, 'empty-complete', source$);
			return <div data-testid="consumer">{useObservableSuspense(resource)}</div>;
		}
		render(
			<Boundary>
				<React.Suspense fallback={<div data-testid="fallback" />}>
					<Consumer />
				</React.Suspense>
			</Boundary>
		);
		await settle();

		expect(screen.queryByTestId('boundary')).toBeNull();
		expect((await screen.findByTestId('consumer')).textContent).toBe('value');
		expect(subscribes).toBe(2);
	});
});

describe('under React.StrictMode', () => {
	/**
	 * Strict Mode replays every mount effect setup/cleanup/setup in development. The cleanup
	 * destroys the claimed resource, so the second setup must not mistake its own prior claim
	 * for a competing reader — and must never leave the consumer holding a DESTROYED resource,
	 * whose `read()` throws "Resource has been destroyed" and whose `shouldUpdate$$` is closed,
	 * freezing the component on whatever it last rendered.
	 */
	it('leaves the consumer holding a live resource, still showing its value', async () => {
		const scope = {};
		const seen: ObservableResource<string>[] = [];
		function Consumer() {
			const resource = useSuspenseResource(
				scope,
				'strict',
				React.useMemo(() => asyncSource(() => undefined), [])
			);
			const value = useObservableSuspense(resource);
			seen.push(resource);
			return <div data-testid="consumer">{value}</div>;
		}
		render(
			<React.StrictMode>
				<React.Suspense fallback={<div data-testid="fallback" />}>
					<Consumer />
				</React.Suspense>
			</React.StrictMode>
		);
		await settle();

		expect((await screen.findByTestId('consumer')).textContent).toBe('value');
		const held = seen[seen.length - 1];
		expect(held.isDestroyed).toBe(false);
		// And it can still push an update: a destroyed resource has completed `shouldUpdate$$`.
		expect(held.valueRef$$.value?.current).toBe('value');
	});

	it('destroys its subscription exactly once when the consumer really unmounts', async () => {
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
		function Consumer() {
			const resource = useSuspenseResource(scope, 'strict-teardown', source$);
			return <div data-testid="consumer">{useObservableSuspense(resource)}</div>;
		}
		const view = render(
			<React.StrictMode>
				<Consumer />
			</React.StrictMode>
		);
		await settle(2);
		await React.act(async () => {
			view.unmount();
		});
		await flushTeardown();

		// Whatever the replay did in between, nothing is left subscribed — and the replay did
		// not cost an extra subscription either.
		expect(subscribes).toBe(1);
		expect(unsubscribes).toBe(1);
	});
});
