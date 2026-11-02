/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { useVariationParentRefresh } from './use-variation-parent-refresh';

const mockEngine = { events: jest.fn(() => jest.fn()) };
const mockDispose = jest.fn();
const mockWatch = jest.fn((_engine: unknown) => mockDispose);
const mockRuntime = { engine: mockEngine };
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => mockRuntime,
	watchVariationParentRefresh: (engine: unknown) => mockWatch(engine),
}));

it('binds the watcher to the runtime engine and disposes on unmount', () => {
	const { rerender, unmount } = renderHook(() => useVariationParentRefresh());
	expect(mockWatch).toHaveBeenCalledWith(mockEngine);
	rerender();
	expect(mockWatch).toHaveBeenCalledTimes(1);
	unmount();
	expect(mockDispose).toHaveBeenCalledTimes(1);
});
