/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { useArmedEndReached } from './use-armed-end-reached';

const mount = (owned = true, options: { measuresViewport?: boolean } = {}) => {
	const extend = jest.fn();
	const pending$ = new BehaviorSubject(false);
	const hook = renderHook(
		({ owned: isOwned }) => useArmedEndReached(extend, pending$, isOwned, options),
		{ initialProps: { owned } }
	);
	return { extend, pending$, ...hook };
};

it('an end-reached while the level owns a clear query extends at once', () => {
	const { extend, result } = mount();
	act(() => result.current.onEndReached());
	expect(extend).toHaveBeenCalledTimes(1);
});

it('an end-reached while the demand is pending is armed and fired once when pending clears', () => {
	const { extend, pending$, result } = mount();
	act(() => pending$.next(true));
	act(() => result.current.onEndReached());
	act(() => result.current.onEndReached());
	expect(extend).not.toHaveBeenCalled();
	act(() => pending$.next(false));
	expect(extend).toHaveBeenCalledTimes(1);
	// Spent: a later clear does not fire it again.
	act(() => pending$.next(true));
	act(() => pending$.next(false));
	expect(extend).toHaveBeenCalledTimes(1);
});

// A child opened over the level: the list already counted this content length as notified and
// will not fire again for it, so an arm spent while covered leaves the level stuck on its first
// window when the child closes.
it('an arm is not spent while the level is covered: it fires exactly once when the level owns the query again', () => {
	const { extend, pending$, result, rerender } = mount();
	act(() => pending$.next(true));
	act(() => result.current.onEndReached());
	rerender({ owned: false });
	act(() => pending$.next(false));
	expect(extend).not.toHaveBeenCalled();
	rerender({ owned: true });
	expect(extend).toHaveBeenCalledTimes(1);
	rerender({ owned: true });
	rerender({ owned: false });
	rerender({ owned: true });
	expect(extend).toHaveBeenCalledTimes(1);
});

it('an end-reached while covered is armed, not dropped, and fires once the level owns the query', () => {
	const { extend, result, rerender } = mount(false);
	act(() => result.current.onEndReached());
	expect(extend).not.toHaveBeenCalled();
	rerender({ owned: true });
	expect(extend).toHaveBeenCalledTimes(1);
});

it('the viewport neither spends an arm while covered nor fires one before the level owns the query', () => {
	const { extend, result, rerender } = mount(false, { measuresViewport: true });
	act(() => result.current.onEndReached());
	act(() => result.current.onViewport(400));
	expect(extend).not.toHaveBeenCalled();
	rerender({ owned: true });
	expect(extend).toHaveBeenCalledTimes(1);
});

it('an end-reached at zero height is held and fired once a positive viewport is back', () => {
	const { extend, result } = mount(true, { measuresViewport: true });
	act(() => result.current.onEndReached());
	expect(extend).not.toHaveBeenCalled();
	act(() => result.current.onViewport(0));
	expect(extend).not.toHaveBeenCalled();
	act(() => result.current.onViewport(400));
	expect(extend).toHaveBeenCalledTimes(1);
	act(() => result.current.onViewport(400));
	expect(extend).toHaveBeenCalledTimes(1);
});
