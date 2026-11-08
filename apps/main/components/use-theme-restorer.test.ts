/**
 * The restorer applies the store's saved theme on every store change, `system`
 * and an unset theme included, so a store switch never inherits the previous
 * store's theme. A name Uniwind has not registered falls back to `system`,
 * since `setTheme` throws on one.
 */
import { renderHook } from '@testing-library/react-native';
import { Uniwind } from 'uniwind';

import { useAppState } from '@wcpos/core/contexts/app-state';

import { useThemeRestorer } from './use-theme-restorer';

jest.mock('uniwind', () => ({ Uniwind: { setTheme: jest.fn() } }));
jest.mock('@wcpos/core/contexts/app-state', () => ({ useAppState: jest.fn() }));

const setTheme = jest.mocked(Uniwind.setTheme);
const mockUseAppState = jest.mocked(useAppState);

function withStore(store: { theme?: string } | null) {
	mockUseAppState.mockReturnValue({ store } as unknown as ReturnType<typeof useAppState>);
}

beforeEach(() => {
	setTheme.mockClear();
});

describe('useThemeRestorer', () => {
	it("applies the store's saved theme", async () => {
		withStore({ theme: 'dark' });
		const { result } = await renderHook(() => useThemeRestorer());

		expect(setTheme).toHaveBeenLastCalledWith('dark');
		expect(result.current).toEqual({ isThemeReady: true, hasStore: true });
	});

	it("applies 'system' when switching from a themed store to a system store", async () => {
		withStore({ theme: 'dark' });
		const { rerender } = await renderHook(() => useThemeRestorer());
		expect(setTheme).toHaveBeenLastCalledWith('dark');

		withStore({ theme: 'system' });
		await rerender({});

		expect(setTheme).toHaveBeenLastCalledWith('system');
	});

	it("applies 'system' for a store with no saved theme", async () => {
		withStore({ theme: 'ocean' });
		const { rerender } = await renderHook(() => useThemeRestorer());

		withStore({});
		await rerender({});

		expect(setTheme).toHaveBeenLastCalledWith('system');
	});

	it("applies 'system' for a theme name Uniwind does not know", async () => {
		withStore({ theme: 'sepia' });
		await renderHook(() => useThemeRestorer());

		expect(setTheme).toHaveBeenLastCalledWith('system');
	});

	it('applies nothing before a store exists', async () => {
		withStore(null);
		const { result } = await renderHook(() => useThemeRestorer());

		expect(setTheme).not.toHaveBeenCalled();
		expect(result.current.hasStore).toBe(false);
	});
});
