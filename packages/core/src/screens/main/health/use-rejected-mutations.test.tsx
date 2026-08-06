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

	it('destroys each observable resource on engine replacement and unmount', () => {
		const { rerender, unmount } = renderHook(() => useRejectedMutations());
		expect(mockResources).toHaveLength(1);

		mockEngine = {};
		rerender();
		expect(mockResources).toHaveLength(2);
		expect(mockResources[0]?.destroy).toHaveBeenCalledTimes(1);

		unmount();
		expect(mockResources[1]?.destroy).toHaveBeenCalledTimes(1);
	});
});
