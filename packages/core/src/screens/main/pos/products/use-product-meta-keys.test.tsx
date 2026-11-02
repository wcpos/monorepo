/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { useProductMetaKeys } from './use-product-meta-keys';

const mockKeys = new BehaviorSubject<string[]>([]);
const mockRuntime = { engine: {} };
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => mockRuntime,
	observeProductMetaKeys: () => mockKeys,
}));

it('renders named suggestions and clears them on absent database', () => {
	const { result, unmount } = renderHook(() => useProductMetaKeys());
	expect(result.current).toEqual([]);
	act(() => mockKeys.next(['_size', 'engraving']));
	expect(result.current).toEqual(['_size', 'engraving']);
	act(() => mockKeys.next([]));
	expect(result.current).toEqual([]);
	unmount();
	expect(mockKeys.observed).toBe(false);
});
