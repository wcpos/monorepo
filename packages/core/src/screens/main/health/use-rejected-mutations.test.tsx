/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { useRejectedMutations } from './use-rejected-mutations';

const mockResources: { destroy: jest.Mock }[] = [];
let mockEngine = {};

jest.mock('@wcpos/query', () => ({
	// The real vocabulary + field map: the hook derives each collection's
	// server-identity column from them to decide whether a discard destroys the
	// record, so a stubbed pair would prove nothing.
	COLLECTION_VOCABULARY: jest.requireActual('@wcpos/query').COLLECTION_VOCABULARY,
	resolveLegacyField: jest.requireActual('@wcpos/query').resolveLegacyField,
	useQueryRuntime: () => ({ engine: mockEngine }),
}));
jest.mock('observable-hooks', () => ({
	ObservableResource: jest.fn().mockImplementation(() => {
		const resource = { destroy: jest.fn() };
		mockResources.push(resource);
		return resource;
	}),
	useObservableSuspense: () => [],
}));

describe('useRejectedMutations', () => {
	beforeEach(() => {
		mockEngine = {};
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
});
