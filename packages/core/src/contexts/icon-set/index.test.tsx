/** @jest-environment jsdom */
import * as React from 'react';

import { act, render } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

const store: {
	icons?: string;
	theme?: string;
	$?: BehaviorSubject<{ icons: string; theme?: string }>;
} = { icons: undefined };
const appState: { store: { icons?: string } | null } = { store };

// The set context as `@wcpos/components/icon` exports it, without the three glyph maps.
jest.mock('@wcpos/components/icon', () => {
	const { createContext, createElement, useContext } = jest.requireActual('react');
	const IconSet = createContext('tabler');
	return {
		ICON_SET_IDS: ['tabler', 'hugeicons', 'phosphor'],
		DEFAULT_ICON_SET: 'tabler',
		ICON_SETTING_AUTO: 'auto',
		IconSetProvider: ({ set, children }: React.PropsWithChildren<{ set: string }>) =>
			createElement(IconSet.Provider, { value: set }, children),
		useIconSet: () => useContext(IconSet),
	};
});
jest.mock('@wcpos/components/lib/themes', () => ({
	iconSetForTheme: (theme: string | undefined) =>
		theme === 'ocean' || theme === 'sunset' ? 'phosphor' : 'tabler',
}));
jest.mock('../app-state', () => ({ useAppState: () => appState }));
jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));

// eslint-disable-next-line import/first
import { useIconSet } from '@wcpos/components/icon';

// eslint-disable-next-line import/first
import { IconSetSettingProvider } from './index';

function Probe() {
	return <span data-testid="set">{useIconSet()}</span>;
}

function renderedSet() {
	const { getByTestId } = render(
		<IconSetSettingProvider>
			<Probe />
		</IconSetSettingProvider>
	);
	return getByTestId('set');
}

beforeEach(() => {
	store.icons = undefined;
	store.theme = undefined;
	delete store.$;
	appState.store = store;
});

describe('IconSetSettingProvider', () => {
	it('draws the default set with no store, so the auth screens have icons', () => {
		appState.store = null;
		expect(renderedSet().textContent).toBe('tabler');
	});

	it("draws the store's chosen set", () => {
		store.icons = 'hugeicons';
		store.theme = 'ocean';
		expect(renderedSet().textContent).toBe('hugeicons');
	});

	it.each(['auto', undefined, 'material'])('follows the theme for icons %p', (icons) => {
		store.icons = icons;
		store.theme = 'ocean';
		expect(renderedSet().textContent).toBe('phosphor');
	});

	it('follows theme emissions while matching the theme', () => {
		store.$ = new BehaviorSubject<{ icons: string; theme?: string }>({
			icons: 'auto',
			theme: 'light',
		});
		const set = renderedSet();
		expect(set.textContent).toBe('tabler');

		act(() => store.$!.next({ icons: 'auto', theme: 'ocean' }));

		expect(set.textContent).toBe('phosphor');
	});

	it('follows a new emission on the same store', () => {
		store.icons = 'hugeicons';
		store.$ = new BehaviorSubject({ icons: 'hugeicons' });
		const set = renderedSet();
		expect(set.textContent).toBe('hugeicons');

		act(() => store.$!.next({ icons: 'phosphor' }));

		expect(set.textContent).toBe('phosphor');
	});
});
