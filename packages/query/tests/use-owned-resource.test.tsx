/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject, Observable, Subject, throwError } from 'rxjs';

import { useOwnedResource } from '../src/use-owned-resource';

/** A source that counts its live subscriptions — the reads a resource holds. */
function countedSource<T>(value: T) {
	let live = 0;
	const subject = new BehaviorSubject(value);
	const source$ = new Observable<T>((subscriber) => {
		live += 1;
		const inner = subject.subscribe(subscriber);
		return () => {
			live -= 1;
			inner.unsubscribe();
		};
	});
	return {
		source$,
		subject,
		get live() {
			return live;
		},
	};
}

describe('useOwnedResource', () => {
	it('reads nothing during render: the read starts when the caller commits', () => {
		const counted = countedSource('a');
		const livesAtRender: number[] = [];
		renderHook(() => {
			const { resource } = useOwnedResource(counted.source$);
			livesAtRender.push(counted.live);
			return resource;
		});
		expect(livesAtRender[0]).toBe(0);
		expect(counted.live).toBe(1);
	});

	it('holds exactly one live read and a live resource after Strict Mode replays it', () => {
		const counted = countedSource('a');
		const { result, unmount } = renderHook(() => useOwnedResource(counted.source$).resource, {
			reactStrictMode: true,
		});
		// Strict Mode ran the initializer twice and the mount effect's cleanup and setup again:
		// one read survives, on a resource the readers can still use.
		expect(counted.live).toBe(1);
		expect(result.current.isDestroyed).toBe(false);
		expect(result.current.read()).toBe('a');
		act(() => counted.subject.next('b'));
		expect(result.current.read()).toBe('b');

		unmount();
		expect(counted.live).toBe(0);
	});

	it('reloads onto a changed source, keeping the current value until it answers', () => {
		const first = countedSource('a');
		const second = new Subject<string>();
		const { result, rerender } = renderHook(({ source$ }) => useOwnedResource(source$).resource, {
			initialProps: { source$: first.source$ },
		});
		const resource = result.current;
		expect(resource.read()).toBe('a');

		rerender({ source$: second });
		expect(result.current).toBe(resource);
		expect(first.live).toBe(0);
		expect(result.current.read()).toBe('a');
		act(() => second.next('c'));
		expect(result.current.read()).toBe('c');
	});

	it('retries a failure that came before any value: readers suspend until the source answers', () => {
		const failure = new Error('read failed');
		let attempt = 0;
		const answers = new Subject<string>();
		const source$ = new Observable<string>((subscriber) => {
			attempt += 1;
			return (attempt === 1 ? throwError(() => failure) : answers).subscribe(subscriber);
		});
		const { result } = renderHook(() => useOwnedResource(source$));
		expect(() => result.current.resource.read()).toThrow(failure);

		act(() => result.current.retry());
		// Mutation: retry by `reload()` alone → read() returns undefined instead of suspending.
		expect(() => result.current.resource.read()).toThrow(expect.any(Promise) as never);
		act(() => answers.next('a'));
		// Mutation: rebuild without re-reading the source → no answer ever lands.
		expect(result.current.resource.read()).toBe('a');
	});

	it('retries a failure after a value by reloading, keeping the value while the source answers', () => {
		const failure = new Error('read failed');
		const answers = new Subject<string>();
		let attempt = 0;
		const source$ = new Observable<string>((subscriber) => {
			attempt += 1;
			if (attempt === 1) {
				subscriber.next('a');
				subscriber.error(failure);
				return undefined;
			}
			return answers.subscribe(subscriber);
		});
		const { result } = renderHook(() => useOwnedResource(source$));
		const resource = result.current.resource;
		expect(() => resource.read()).toThrow(failure);

		act(() => result.current.retry());
		// Mutation: always rebuild → a new resource, and the readers lose the value they had.
		expect(result.current.resource).toBe(resource);
		expect(resource.read()).toBe('a');
		act(() => answers.next('b'));
		expect(resource.read()).toBe('b');
	});
});
