/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import { mockCategories } from './test-utils';
import { useLocalCategories } from './use-local-categories';

// Querying just the assigned ids, going past three rounds, or retaining the old period breaks these.
it('reads ancestors locally for at most three rounds and observes their changes', () => {
	mockCategories.next([
		{ id: 4, name: 'Leaf', parent: 3 },
		{ id: 3, name: 'Parent', parent: 2 },
		{ id: 2, name: 'Grandparent', parent: 1 },
		{ id: 1, name: 'Root', parent: 0 },
	]);
	const { result, rerender } = renderHook(({ ids }) => useLocalCategories(ids), {
		initialProps: { ids: [4, 4] },
	});
	expect([...result.current!.keys()]).toEqual([4, 3, 2]);
	act(() =>
		mockCategories.next([
			{ id: 4, name: 'Leaf', parent: 1 },
			{ id: 1, name: 'Root', parent: 0 },
		])
	);
	expect([...result.current!.keys()]).toEqual([4, 1]);
	rerender({ ids: [99] });
	expect([...result.current!.keys()]).toEqual([]);
});
it('is undefined until the categories emit and stops at an absent parent', () => {
	mockCategories.next(undefined);
	const { result } = renderHook(() => useLocalCategories([2]));
	expect(result.current).toBeUndefined();
	act(() => mockCategories.next([{ id: 2, name: 'Orphan', parent: 99 }]));
	expect([...result.current!.keys()]).toEqual([2]);
});
