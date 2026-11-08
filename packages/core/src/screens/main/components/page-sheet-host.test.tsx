/** @jest-environment jsdom */
import * as React from 'react';

import { act, renderHook } from '@testing-library/react';

import { OverlayHostProvider } from '@wcpos/components/lib/overlay-host';

import { setFocusedPageSheetHost, usePageSheetHost } from './page-sheet-host';

let mockSize: 'sm' | 'lg' = 'sm';
jest.mock('@wcpos/components/lib/device', () => ({
	...jest.requireActual('@wcpos/components/lib/device'),
	useIsPhone: () => mockSize === 'sm',
}));

const wrapper = ({ children }: React.PropsWithChildren) => (
	<OverlayHostProvider name="scene:reports" phoneUsesRoot>
		{children}
	</OverlayHostProvider>
);

afterEach(() => setFocusedPageSheetHost(undefined));

// A wide sheet must leave the rail outside its host; a phone has no rail.
it.each([
	['lg', 'scene:reports'],
	['sm', undefined],
] as const)('on %s renders the page sheet on %s', (size, host) => {
	mockSize = size;
	const { result } = renderHook(() => usePageSheetHost(), { wrapper });
	expect(result.current).toBe(host);
});

// Outside a drawer screen, before any screen has focused, there is no page host to use.
it('uses the root on wide with no provider and no focused screen', () => {
	mockSize = 'lg';
	const { result } = renderHook(() => usePageSheetHost());
	expect(result.current).toBeUndefined();
});

// Revert: drop the focused-host fallback; the title bar's cashier sheet falls to the root and
// covers the rail (Greptile, #3419).
it('follows the focused screen above every screen, and its own provider under one', () => {
	mockSize = 'lg';
	const above = renderHook(() => usePageSheetHost());
	const under = renderHook(() => usePageSheetHost(), { wrapper });
	act(() => setFocusedPageSheetHost('scene:orders'));
	expect(above.result.current).toBe('scene:orders');
	expect(under.result.current).toBe('scene:reports');
	act(() => setFocusedPageSheetHost('scene:products'));
	expect(above.result.current).toBe('scene:products');
});

// The till nests its own `pos` host in its page's: a Reports sheet the register panel reuses
// there (the closure panel's print and recount sheets) keeps the page's host. Revert: read the
// nearest host; this reads `pos` on both sizes.
it.each([
	['lg', 'scene:(pos)'],
	['sm', undefined],
] as const)('under the till on %s reads the page host %s', (size, host) => {
	mockSize = size;
	const { result } = renderHook(() => usePageSheetHost(), {
		wrapper: ({ children }) => (
			<OverlayHostProvider name="scene:(pos)" phoneUsesRoot>
				<OverlayHostProvider name="pos">{children}</OverlayHostProvider>
			</OverlayHostProvider>
		),
	});
	expect(result.current).toBe(host);
});
