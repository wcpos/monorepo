/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { hasSurface, invokeSurface, resetSurfaces, SurfaceNotMountedError } from './surfaces';
import { useRegisterSurface } from './use-register-surface';

beforeEach(() => resetSurfaces());

it('registers once on mount and always invokes the latest handler', async () => {
	const first = jest.fn();
	const second = jest.fn();
	const { rerender, unmount } = renderHook(
		({ handler }: { handler: () => void }) => useRegisterSurface('pay', handler),
		{ initialProps: { handler: first } }
	);
	rerender({ handler: second });
	await invokeSurface('pay');
	expect(second).toHaveBeenCalledTimes(1);
	expect(first).not.toHaveBeenCalled();
	unmount();
	await expect(invokeSurface('pay')).rejects.toBeInstanceOf(SurfaceNotMountedError);
});

it('registers only while enabled', () => {
	const { rerender, unmount } = renderHook(
		({ enabled }: { enabled: boolean }) => useRegisterSurface('cart', () => undefined, enabled),
		{ initialProps: { enabled: false } }
	);
	expect(hasSurface('cart')).toBe(false);
	rerender({ enabled: true });
	expect(hasSurface('cart')).toBe(true);
	rerender({ enabled: false });
	expect(hasSurface('cart')).toBe(false);
	rerender({ enabled: true });
	unmount();
	expect(hasSurface('cart')).toBe(false);
});
