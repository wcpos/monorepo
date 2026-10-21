/** @jest-environment jsdom */
import * as React from 'react';

import { act, render } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

const store: { icons?: string; $?: BehaviorSubject<{ icons: string }> } = { icons: undefined };
const appState: { store: { icons?: string } | null } = { store };

// The set context as `@wcpos/components/icon` exports it, without the eight glyph maps.
jest.mock('@wcpos/components/icon', () => {
	const { createContext, createElement, useContext } = jest.requireActual('react');
	const IconSet = createContext('tabler');
	return {
		ICON_SET_IDS: [
			'fontawesome',
			'tabler',
			'tabler-2',
			'hugeicons',
			'lucide',
			'phosphor',
			'iconoir',
			'solar',
		],
		DEFAULT_ICON_SET: 'tabler',
		IconSetProvider: ({ set, children }: React.PropsWithChildren<{ set: string }>) =>
			createElement(IconSet.Provider, { value: set }, children),
		useIconSet: () => useContext(IconSet),
	};
});
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
	delete store.$;
	appState.store = store;
});

describe('IconSetSettingProvider', () => {
	it('draws the default set with no store, so the auth screens have icons', () => {
		appState.store = null;
		expect(renderedSet().textContent).toBe('tabler');
	});

	it("draws the store's chosen set", () => {
		store.icons = 'lucide';
		expect(renderedSet().textContent).toBe('lucide');
	});

	it('falls back to the default for a value that is not a set', () => {
		store.icons = 'material';
		expect(renderedSet().textContent).toBe('tabler');
	});

	it('follows a new emission on the same store', () => {
		store.icons = 'lucide';
		store.$ = new BehaviorSubject({ icons: 'lucide' });
		const set = renderedSet();
		expect(set.textContent).toBe('lucide');

		act(() => store.$!.next({ icons: 'phosphor' }));

		expect(set.textContent).toBe('phosphor');
	});
});
