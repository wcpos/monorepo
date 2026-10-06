/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { type Observable, Subject } from 'rxjs';

import { useAnswerOf } from './use-answer-of';

it('answers only with what the observable now asked has emitted', () => {
	const first = new Subject<number>();
	const second = new Subject<number>();
	const { result, rerender } = renderHook(({ source$ }) => useAnswerOf(source$), {
		initialProps: { source$: first as Observable<number> },
	});
	expect(result.current).toBeUndefined();
	act(() => first.next(1));
	expect(result.current).toBe(1);

	// A new observable has not answered yet, whatever the old one said.
	rerender({ source$: second });
	expect(result.current).toBeUndefined();
	act(() => first.next(2));
	expect(result.current).toBeUndefined();
	act(() => second.next(3));
	expect(result.current).toBe(3);
});
