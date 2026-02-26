/**
 * Tests for TranslationProvider integration with i18next v25.
 *
 * These tests verify the behavior of the i18n instance creation and
 * configuration used by the TranslationProvider.
 */

import { createInstance } from 'i18next';

import { RxDBBackend } from './rxdb-backend';
import en from './locales/en/core.json';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
	mockFetch.mockReset();
});

describe('TranslationProvider i18n configuration', () => {
	it('creates an i18n instance with correct default configuration', async () => {
		const instance = createInstance();
		await instance.use(RxDBBackend).init({
			lng: 'en',
			fallbackLng: 'en',
			load: 'currentOnly',
			partialBundledLanguages: true,
			ns: ['core'],
			defaultNS: 'core',
			resources: {
				en: { core: en },
			},
			keySeparator: false,
			nsSeparator: false,
			interpolation: {
				escapeValue: false,
				prefix: '{',
				suffix: '}',
			},
			backend: {
				translationsState: null,
			},
		});

		expect(instance.language).toBe('en');
		expect(instance.options.fallbackLng).toEqual(['en']);
		expect(instance.options.defaultNS).toBe('core');
	});

	it('handles language changes correctly', async () => {
		const instance = createInstance();
		await instance.use(RxDBBackend).init({
			lng: 'en',
			fallbackLng: 'en',
			ns: ['core'],
			defaultNS: 'core',
			resources: {
				en: { core: en },
			},
			backend: {
				translationsState: null,
			},
		});

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ greeting: 'Bonjour' }),
		});

		await instance.changeLanguage('fr');

		expect(instance.language).toBe('fr');
	});

	it('handles rapid language changes (v25 behavior)', async () => {
		const instance = createInstance();
		await instance.use(RxDBBackend).init({
			lng: 'en',
			fallbackLng: 'en',
			ns: ['core'],
			defaultNS: 'core',
			resources: {
				en: { core: en },
			},
			backend: {
				translationsState: null,
			},
		});

		// Mock responses for each language
		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({}),
		});

		// Trigger multiple rapid language changes
		const promises = [
			instance.changeLanguage('fr'),
			instance.changeLanguage('de'),
			instance.changeLanguage('es'),
		];

		await Promise.all(promises);

		// The last language should win
		expect(instance.language).toBe('es');
	});

	it('uses custom interpolation delimiters', async () => {
		const instance = createInstance();
		await instance.init({
			lng: 'en',
			resources: {
				en: {
					translation: {
						greeting: 'Hello {name}',
					},
				},
			},
			interpolation: {
				escapeValue: false,
				prefix: '{',
				suffix: '}',
			},
		});

		const translation = instance.t('greeting', { name: 'World' });
		expect(translation).toBe('Hello World');
	});

	it('disables key and namespace separators', async () => {
		const instance = createInstance();
		await instance.init({
			lng: 'en',
			resources: {
				en: {
					translation: {
						'key.with.dots': 'Value with dots',
						'key:with:colons': 'Value with colons',
					},
				},
			},
			keySeparator: false,
			nsSeparator: false,
		});

		// With separators disabled, these keys should work literally
		expect(instance.t('key.with.dots')).toBe('Value with dots');
		expect(instance.t('key:with:colons')).toBe('Value with colons');
	});

	it('uses cached translations from translationsState without fetching', async () => {
		const translationsState = {
			fr: { greeting: 'Bonjour from cache', 'common.cancel': 'Annuler' },
			set: jest.fn(),
		};

		const instance = createInstance();
		await instance.use(RxDBBackend).init({
			lng: 'en',
			fallbackLng: 'en',
			ns: ['core'],
			defaultNS: 'core',
			resources: {
				en: { core: en },
			},
			backend: {
				translationsState,
			},
		});

		const initialFetchCount = mockFetch.mock.calls.length;

		await instance.changeLanguage('fr');

		// The key assertion: cached translations should not trigger a fetch
		expect(mockFetch.mock.calls.length).toBe(initialFetchCount);

		// Language should be changed
		expect(instance.language).toBe('fr');
	});
});
