/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { useRejectedMutations } from './use-rejected-mutations';

const mockResources: { destroy: jest.Mock }[] = [];
let mockEngine = {};
let mockRead = { rows: [], readError: false };

jest.mock('@wcpos/query', () => ({
	// The real map of each collection's server-identity column: the hook reads it
	// to decide whether a discard destroys the record, so a stubbed one would
	// prove nothing.
	WRITEABLE_REMOTE_ID_FIELD: jest.requireActual('@wcpos/query').WRITEABLE_REMOTE_ID_FIELD,
	useQueryRuntime: () => ({ engine: mockEngine }),
}));
jest.mock('observable-hooks', () => ({
	ObservableResource: jest.fn().mockImplementation(() => {
		const resource = { destroy: jest.fn() };
		mockResources.push(resource);
		return resource;
	}),
	useObservableSuspense: () => mockRead,
}));

describe('useRejectedMutations', () => {
	beforeEach(() => {
		mockEngine = {};
		mockRead = { rows: [], readError: false };
		mockResources.length = 0;
	});

	it('reuses ONE resource per engine across re-renders — never a fresh one each render', () => {
		// The heart of the #40/#832 fix: the resource must survive across renders
		// (and Suspense retries), so a re-render with the SAME engine must not build
		// a second one. A per-render resource is exactly what hung the panel.
		const { rerender } = renderHook(() => useRejectedMutations());
		expect(mockResources).toHaveLength(1);

		rerender();
		rerender();
		expect(mockResources).toHaveLength(1);
	});

	it('builds a distinct resource for a different engine (scope switch)', () => {
		const { rerender } = renderHook(() => useRejectedMutations());
		expect(mockResources).toHaveLength(1);

		mockEngine = {};
		rerender();
		expect(mockResources).toHaveLength(2);
	});

	it('drops a completed error resource so reloading resubscribes with the same engine', () => {
		mockRead = { rows: [], readError: true };
		const first = renderHook(() => useRejectedMutations());
		expect(mockResources).toHaveLength(1);
		first.unmount();

		mockRead = { rows: [], readError: false };
		renderHook(() => useRejectedMutations());
		expect(mockResources).toHaveLength(2);
	});
});
