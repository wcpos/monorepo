/**
 * @jest-environment jsdom
 *
 * Regression tests for #40 — settings form labels stayed in English after a
 * language change while the POS product table behind them translated correctly.
 *
 * The provider used to mint a NEW i18next instance for every locale, so the
 * language switch was delivered purely by React context propagation. Any
 * consumer still holding the previous instance — one that resolved i18next
 * through react-i18next's module-level default, or a subtree the context update
 * did not reach — kept rendering against an abandoned instance that never
 * changes language, and therefore stayed in English forever.
 */
import * as React from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import { I18nContext } from 'react-i18next';
import { BehaviorSubject } from 'rxjs';

import { TranslationProvider, useT } from './index';

jest.mock('expo-localization', () => ({
	getLocales: () => [{ languageTag: 'en-US', languageCode: 'en' }],
}));

let mockAppState: {
	store?: { locale$: BehaviorSubject<string | null> };
	translationsState: { set: jest.Mock };
};
jest.mock('../app-state', () => ({
	useAppState: () => mockAppState,
}));

const FRENCH: Record<string, string> = {
	'settings.store_name': 'Nom du magasin',
};

const mockFetch = jest.fn(
	async (url: string) =>
		({
			ok: true,
			json: async () => (String(url).includes('/fr_FR/') ? FRENCH : {}),
		}) as unknown as Response
);
global.fetch = mockFetch as unknown as typeof fetch;

function Label({ id }: { id: string }) {
	const t = useT();
	return <span data-testid={id}>{t('settings.store_name')}</span>;
}

function setupLocale(initial: string) {
	const locale$ = new BehaviorSubject<string | null>(initial);
	mockAppState = { store: { locale$ }, translationsState: { set: jest.fn() } };
	return locale$;
}

beforeEach(() => {
	mockFetch.mockClear();
});

describe('locale change', () => {
	it('re-renders t() consumers inside the provider', async () => {
		const locale$ = setupLocale('en_US');

		render(
			<TranslationProvider>
				<React.Suspense fallback={<span data-testid="fallback" />}>
					<Label id="label" />
				</React.Suspense>
			</TranslationProvider>
		);

		await waitFor(() => expect(screen.getByTestId('label').textContent).toBe('Store Name'));

		locale$.next('fr_FR');

		await waitFor(() => expect(screen.getByTestId('label').textContent).toBe('Nom du magasin'), {
			timeout: 3000,
		});
	});

	it('re-renders a consumer that resolved i18next through the module-level default', async () => {
		const locale$ = setupLocale('en_US');

		render(
			<>
				<TranslationProvider>
					<React.Suspense fallback={null}>
						<Label id="inside" />
					</React.Suspense>
				</TranslationProvider>
				{/* No provider above it: react-i18next falls back to `getI18n()`. */}
				<React.Suspense fallback={null}>
					<Label id="outside" />
				</React.Suspense>
			</>
		);

		await waitFor(() => expect(screen.getByTestId('inside').textContent).toBe('Store Name'));
		expect(screen.getByTestId('outside').textContent).toBe('Store Name');

		locale$.next('fr_FR');

		await waitFor(() => expect(screen.getByTestId('inside').textContent).toBe('Nom du magasin'), {
			timeout: 3000,
		});
		expect(screen.getByTestId('outside').textContent).toBe('Nom du magasin');
	});

	it('keeps a single i18next instance and switches its language', async () => {
		const locale$ = setupLocale('en_US');
		const seen: unknown[] = [];

		function Probe() {
			seen.push(React.useContext(I18nContext)?.i18n);
			return null;
		}

		render(
			<TranslationProvider>
				<Probe />
				<React.Suspense fallback={null}>
					<Label id="label" />
				</React.Suspense>
			</TranslationProvider>
		);

		await waitFor(() => expect(screen.getByTestId('label').textContent).toBe('Store Name'));

		locale$.next('fr_FR');

		await waitFor(() => expect(screen.getByTestId('label').textContent).toBe('Nom du magasin'), {
			timeout: 3000,
		});

		// One instance for the provider's lifetime — no abandoned instance is left
		// behind holding the old language (and no leaked listeners or backend).
		expect(new Set(seen).size).toBe(1);
		expect((seen[0] as { language: string }).language).toBe('fr_FR');
	});
});
