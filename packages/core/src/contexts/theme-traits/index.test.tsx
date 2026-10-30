/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';
import { loadAsync } from 'expo-font';
import { BehaviorSubject } from 'rxjs';

import { FONT_FACES } from '@wcpos/components/lib/fonts';
import { SYSTEM_TYPE, useThemeTraits } from '@wcpos/components/lib/theme-traits';
import { THEME_TYPE } from '@wcpos/components/lib/themes';

import { ThemeTraitsSettingProvider } from './index';

const store: { theme?: string; $?: BehaviorSubject<{ theme: string }> } = {};
jest.mock('../app-state', () => ({ useAppState: () => ({ store }) }));
jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));
jest.mock('expo-font', () => ({ loadAsync: jest.fn() }));

function pendingLoad() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

function Probe() {
	return <span data-testid="type">{JSON.stringify(useThemeTraits().type)}</span>;
}

function renderType() {
	return render(
		<ThemeTraitsSettingProvider>
			<Probe />
		</ThemeTraitsSettingProvider>
	);
}

const drawnType = () => JSON.parse(screen.getByTestId('type').textContent!);

beforeEach(() => {
	store.theme = undefined;
	delete store.$;
	jest.mocked(loadAsync).mockReset();
});

it('draws system type on light without loading fonts', () => {
	store.theme = 'light';
	renderType();
	expect(drawnType()).toEqual(SYSTEM_TYPE);
	expect(loadAsync).not.toHaveBeenCalled();
});

it('draws system type until the market faces load', async () => {
	const load = pendingLoad();
	jest.mocked(loadAsync).mockReturnValue(load.promise);
	store.theme = 'market';
	renderType();
	expect(drawnType()).toEqual(SYSTEM_TYPE);
	expect(loadAsync).toHaveBeenCalledWith([FONT_FACES.Manrope]);
	await act(async () => load.resolve());
	expect(drawnType()).toEqual(THEME_TYPE.market);
});

it('keeps system type and warns once when loading fails', async () => {
	const load = pendingLoad();
	jest.mocked(loadAsync).mockReturnValue(load.promise);
	const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	store.theme = 'market';
	const { rerender } = renderType();
	await act(async () => load.reject(new Error('Failed to load font')));
	rerender(
		<ThemeTraitsSettingProvider>
			<Probe />
		</ThemeTraitsSettingProvider>
	);
	expect(drawnType()).toEqual(SYSTEM_TYPE);
	expect(warn).toHaveBeenCalledTimes(1);
	expect(loadAsync).toHaveBeenCalledTimes(1);
	warn.mockRestore();
});

it('loads the next theme and never applies the previous theme result', async () => {
	const paper = pendingLoad();
	const market = pendingLoad();
	jest.mocked(loadAsync).mockReturnValueOnce(paper.promise).mockReturnValueOnce(market.promise);
	store.$ = new BehaviorSubject({ theme: 'paper' });
	renderType();
	expect(loadAsync).toHaveBeenNthCalledWith(1, [
		FONT_FACES['DM Sans'],
		FONT_FACES['JetBrains Mono'],
		FONT_FACES['Instrument Serif'],
	]);
	act(() => store.$!.next({ theme: 'market' }));
	expect(loadAsync).toHaveBeenNthCalledWith(2, [FONT_FACES.Manrope]);
	await act(async () => paper.resolve());
	expect(drawnType()).toEqual(SYSTEM_TYPE);
	await act(async () => market.resolve());
	expect(drawnType()).toEqual(THEME_TYPE.market);
});
