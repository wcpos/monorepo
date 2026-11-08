/** @jest-environment jsdom */
/**
 * The provider applies the store's saved theme on startup and on every store change, `system`
 * and an unset theme included, so a store switch never inherits the previous store's theme.
 * A name Uniwind has not registered falls back to `system`, since `setTheme` throws on one.
 */
import * as React from 'react';

import { render } from '@testing-library/react';
import { Uniwind } from 'uniwind';

import { ThemeSettingProvider, useThemeSetting } from './index';

jest.mock('uniwind', () => ({ Uniwind: { setTheme: jest.fn() } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@wcpos/components/icon', () => ({
	ICON_SET_IDS: ['tabler', 'hugeicons', 'phosphor'],
	IconSetProvider: ({ children }: React.PropsWithChildren) => children,
}));
const appState: { store: { theme?: string; icons?: string; fonts?: string } | null } = {
	store: null,
};
jest.mock('../app-state', () => ({ useAppState: () => appState }));
jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));

const setTheme = jest.mocked(Uniwind.setTheme);

function Probe() {
	return <span data-testid="setting">{JSON.stringify(useThemeSetting())}</span>;
}

function withStore(store: { theme?: string; icons?: string; fonts?: string } | null) {
	appState.store = store;
	return (
		<ThemeSettingProvider>
			<Probe />
		</ThemeSettingProvider>
	);
}

beforeEach(() => {
	setTheme.mockClear();
});

describe('ThemeSettingProvider', () => {
	it("applies the store's saved theme", () => {
		render(withStore({ theme: 'dark' }));

		expect(setTheme).toHaveBeenLastCalledWith('dark');
	});

	it("applies 'system' when switching from a themed store to a system store", () => {
		const { rerender } = render(withStore({ theme: 'dark' }));
		expect(setTheme).toHaveBeenLastCalledWith('dark');

		rerender(withStore({ theme: 'system' }));

		expect(setTheme).toHaveBeenLastCalledWith('system');
	});

	it("applies 'system' for a store with no saved theme", () => {
		const { rerender } = render(withStore({ theme: 'ocean' }));

		rerender(withStore({}));

		expect(setTheme).toHaveBeenLastCalledWith('system');
	});

	it("applies 'system' for a theme name Uniwind does not know", () => {
		render(withStore({ theme: 'sepia' }));

		expect(setTheme).toHaveBeenLastCalledWith('system');
	});

	it('applies nothing before a store exists', () => {
		render(withStore(null));

		expect(setTheme).not.toHaveBeenCalled();
	});

	it('applies the theme once per store, not on every render', () => {
		const store = { theme: 'ocean' };
		const { rerender } = render(withStore(store));
		rerender(withStore(store));

		expect(setTheme).toHaveBeenCalledTimes(1);
	});

	it("hands the screens the store's choice as saved", () => {
		const { getByTestId } = render(withStore({ theme: 'paper', icons: 'auto', fonts: 'system' }));

		expect(JSON.parse(getByTestId('setting').textContent!)).toEqual({
			theme: 'paper',
			icons: 'auto',
			fonts: 'system',
		});
	});
});
