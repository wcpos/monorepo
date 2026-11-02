import { act, renderHook } from '@testing-library/react';

import { registerPortalContainer, usePortalContainer } from './portal-container';

it('publishes registration and removal, leaving unknown hosts undefined', () => {
	const element = document.createElement('div');
	const { result } = renderHook(() => usePortalContainer('pos'));
	expect(result.current).toBeUndefined();
	act(() => registerPortalContainer('pos', element));
	expect(result.current).toBe(element);
	const unknown = renderHook(() => usePortalContainer('unknown'));
	const unnamed = renderHook(() => usePortalContainer());
	expect(unknown.result.current).toBeUndefined();
	expect(unnamed.result.current).toBeUndefined();
	act(() => registerPortalContainer('pos', null));
	expect(result.current).toBeUndefined();
});
