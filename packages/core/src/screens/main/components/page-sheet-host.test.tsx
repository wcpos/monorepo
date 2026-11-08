/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { usePageSheetHost } from './page-sheet-host';

let mockSize: 'sm' | 'lg' = 'sm';
jest.mock('@wcpos/components/lib/device', () => ({
	...jest.requireActual('@wcpos/components/lib/device'),
	useIsPhone: () => mockSize === 'sm',
}));

// A wide sheet must leave the rail outside its host; a phone has no rail.
it.each([
	['lg', 'scene'],
	['sm', undefined],
] as const)('on %s renders the page sheet on %s', (size, host) => {
	mockSize = size;
	const { result } = renderHook(() => usePageSheetHost());
	expect(result.current).toBe(host);
});
