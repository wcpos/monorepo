/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { TranslationProvider } from './index';

// First-load locale regression (#1089 item 3): a 2026-08-07 HAR showed the system
// locale's bundle (en_GB) downloaded moments before the store locale (es_ES)
// replaced it. The store document hydrates before TranslationProvider mounts and
// its locale$ emits synchronously, so the store locale must win the FIRST init —
// the system locale is only correct when no store is selected (first-ever login).

// The system reports en-GB. Must be mocked here (not via the global en-US mock)
// because use-locale computes systemLanguage at module evaluation.
jest.mock('expo-localization', () => ({
	getLocales: () => [{ languageTag: 'en-GB', languageCode: 'en' }],
}));

let appState: {
	store?: { locale$: BehaviorSubject<string | null> };
	translationsState: { set: jest.Mock };
};
jest.mock('../app-state', () => ({
	useAppState: () => appState,
}));

const mockFetch = jest.fn(
	async (_url: string) =>
		({
			ok: true,
			json: async () => ({ greeting: 'hola' }),
		}) as unknown as Response
);
global.fetch = mockFetch as unknown as typeof fetch;

const fetchedUrls = () => mockFetch.mock.calls.map(([url]) => String(url));

beforeEach(() => {
	mockFetch.mockClear();
});

describe('first-load translation locale', () => {
	it('fetches only the hydrated store locale, never the system locale', async () => {
		appState = {
			store: { locale$: new BehaviorSubject<string | null>('es_ES') },
			translationsState: { set: jest.fn() },
		};

		render(
			<TranslationProvider>
				<span />
			</TranslationProvider>
		);

		await waitFor(() => expect(mockFetch).toHaveBeenCalled());

		expect(fetchedUrls().every((url) => url.includes('/es_ES/monorepo/'))).toBe(true);
		expect(fetchedUrls().some((url) => url.includes('/en_GB/'))).toBe(false);
	});

	it('falls back to the system locale when no store is selected (first-ever login)', async () => {
		appState = {
			translationsState: { set: jest.fn() },
		};

		render(
			<TranslationProvider>
				<span />
			</TranslationProvider>
		);

		await waitFor(() => expect(mockFetch).toHaveBeenCalled());

		expect(fetchedUrls()[0]).toContain('/en_GB/monorepo/');
	});

	it('loads a later locale change without refetching the abandoned one', async () => {
		const locale$ = new BehaviorSubject<string | null>('es_ES');
		appState = {
			store: { locale$ },
			translationsState: { set: jest.fn() },
		};

		render(
			<TranslationProvider>
				<span />
			</TranslationProvider>
		);
		await waitFor(() => expect(mockFetch).toHaveBeenCalled());
		mockFetch.mockClear();

		locale$.next('fr_FR');

		await waitFor(() => expect(mockFetch).toHaveBeenCalled());
		expect(fetchedUrls().every((url) => url.includes('/fr_FR/monorepo/'))).toBe(true);
	});
});
