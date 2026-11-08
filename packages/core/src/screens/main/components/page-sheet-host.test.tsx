/** @jest-environment jsdom */
import * as React from 'react';

import { renderHook } from '@testing-library/react';

import { PageSheetHostContext, usePageSheetHost } from './page-sheet-host';

let mockSize: 'sm' | 'lg' = 'sm';
jest.mock('@wcpos/components/lib/device', () => ({
	...jest.requireActual('@wcpos/components/lib/device'),
	useIsPhone: () => mockSize === 'sm',
}));

const wrapper = ({ children }: React.PropsWithChildren) => (
	<PageSheetHostContext.Provider value="scene:reports">{children}</PageSheetHostContext.Provider>
);

// A wide sheet must leave the rail outside its host; a phone has no rail.
it.each([
	['lg', 'scene:reports'],
	['sm', undefined],
] as const)('on %s renders the page sheet on %s', (size, host) => {
	mockSize = size;
	const { result } = renderHook(() => usePageSheetHost(), { wrapper });
	expect(result.current).toBe(host);
});

// Outside a drawer screen there is no page host to use.
it('uses the root on wide with no provider', () => {
	mockSize = 'lg';
	const { result } = renderHook(() => usePageSheetHost());
	expect(result.current).toBeUndefined();
});
