import {
	hasSurface,
	invokeSurface,
	registerSurface,
	resetSurfaces,
	SurfaceNotMountedError,
} from './surfaces';

beforeEach(() => resetSurfaces());

it('rejects with SurfaceNotMountedError when nothing is registered', async () => {
	await expect(invokeSurface('pay')).rejects.toBeInstanceOf(SurfaceNotMountedError);
	await expect(invokeSurface('pay')).rejects.toMatchObject({ target: 'pay' });
});

it('invokes the registered handler and passes on its rejection', async () => {
	const handler = jest.fn(async () => undefined);
	registerSurface('search', handler);
	await invokeSurface('search');
	expect(handler).toHaveBeenCalledTimes(1);
	registerSurface('void', () => Promise.reject(new Error('refused')));
	await expect(invokeSurface('void')).rejects.toThrow('refused');
});

it('removes only its own entry on detach', async () => {
	const first = jest.fn();
	const detachFirst = registerSurface('pay', first);
	const second = jest.fn();
	registerSurface('pay', second);
	detachFirst();
	await invokeSurface('pay');
	expect(second).toHaveBeenCalledTimes(1);
	expect(first).not.toHaveBeenCalled();
	// A second detach of the same entry is harmless.
	detachFirst();
	await invokeSurface('pay');
	expect(second).toHaveBeenCalledTimes(2);
});

it('lets the newest registration win on a remount, and falls back when it goes', async () => {
	const old = jest.fn();
	const detachOld = registerSurface('discount', old);
	const fresh = jest.fn();
	const detachFresh = registerSurface('discount', fresh);
	await invokeSurface('discount');
	expect(fresh).toHaveBeenCalledTimes(1);
	expect(old).not.toHaveBeenCalled();
	detachFresh();
	await invokeSurface('discount');
	expect(old).toHaveBeenCalledTimes(1);
	detachOld();
	await expect(invokeSurface('discount')).rejects.toBeInstanceOf(SurfaceNotMountedError);
});

it('keeps targets apart', async () => {
	registerSurface('search', jest.fn());
	await expect(invokeSurface('discount')).rejects.toBeInstanceOf(SurfaceNotMountedError);
});

it('hasSurface answers for the mounted state only', () => {
	expect(hasSurface('void')).toBe(false);
	const detach = registerSurface('void', () => undefined);
	expect(hasSurface('void')).toBe(true);
	detach();
	expect(hasSurface('void')).toBe(false);
});
