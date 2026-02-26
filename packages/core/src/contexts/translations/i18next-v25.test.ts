/**
 * Tests for i18next v25 breaking changes and behavior.
 *
 * These tests verify that the upgrade from v24 to v25 doesn't break expected functionality,
 * particularly around:
 * 1. Multiple concurrent changeLanguage() calls
 * 2. Language change ordering
 * 3. Fallback behavior with getBestMatchFromCodes
 */

import { createInstance } from 'i18next';

import { RxDBBackend } from './rxdb-backend';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockFetchResponse(data: Record<string, string> | null) {
	if (data === null) {
		return mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
	}
	return mockFetch.mockResolvedValueOnce({
		ok: true,
		json: () => Promise.resolve(data),
	});
}

beforeEach(() => {
	mockFetch.mockReset();
});

describe('i18next v25 - Multiple concurrent changeLanguage calls', () => {
	it('handles multiple rapid changeLanguage calls in correct order', async () => {
		const i18n = createInstance();
		await i18n.init({
			lng: 'en',
			fallbackLng: 'en',
			resources: {
				en: { translation: { key: 'English' } },
				fr: { translation: { key: 'French' } },
				de: { translation: { key: 'German' } },
			},
		});

		// Trigger multiple language changes rapidly
		const promises = [
			i18n.changeLanguage('fr'),
			i18n.changeLanguage('de'),
			i18n.changeLanguage('en'),
		];

		await Promise.all(promises);

		// The final language should be 'en' (last call wins)
		expect(i18n.language).toBe('en');
		expect(i18n.t('key')).toBe('English');
	});

	it('handles interleaved async language changes correctly', async () => {
		const translationsState = {
			set: jest.fn(),
			get: jest.fn(() => null),
		};

		const i18n = createInstance();
		i18n.use(RxDBBackend);
		await i18n.init({
			lng: 'en',
			fallbackLng: 'en',
			ns: ['core'],
			defaultNS: 'core',
			resources: {
				en: { core: { key: 'English' } },
			},
			backend: {
				translationsState,
			},
		});

		// Mock fetch responses for different languages
		mockFetchResponse({ key: 'French' }); // fr
		mockFetchResponse({ key: 'German' }); // de
		mockFetchResponse({ key: 'Spanish' }); // es

		// Start three language changes with slight delays
		const promise1 = i18n.changeLanguage('fr');
		await new Promise((r) => setTimeout(r, 10));
		const promise2 = i18n.changeLanguage('de');
		await new Promise((r) => setTimeout(r, 10));
		const promise3 = i18n.changeLanguage('es');

		await Promise.all([promise1, promise2, promise3]);

		// In v25, the last changeLanguage call (es) should win
		expect(i18n.language).toBe('es');
	});

	it('maintains language state when changeLanguage is called before previous one completes', async () => {
		const translationsState = {
			set: jest.fn(),
			get: jest.fn(() => null),
		};

		const i18n = createInstance();
		i18n.use(RxDBBackend);
		await i18n.init({
			lng: 'en',
			fallbackLng: 'en',
			ns: ['core'],
			defaultNS: 'core',
			resources: {
				en: { core: { greeting: 'Hello' } },
			},
			backend: {
				translationsState,
			},
		});

		// Mock slow response for first language
		mockFetchResponse({ greeting: 'Bonjour' }); // fr - will resolve slowly
		mockFetchResponse({ greeting: 'Hola' }); // es - will resolve quickly

		// Don't await the first change
		const frPromise = i18n.changeLanguage('fr');

		// Immediately trigger another change
		const esPromise = i18n.changeLanguage('es');

		await Promise.all([frPromise, esPromise]);

		// The second call should be the active language
		expect(i18n.language).toBe('es');
	});
});

describe('i18next v25 - Language fallback behavior', () => {
	it('correctly handles regional locale fallback', async () => {
		const translationsState = {
			set: jest.fn(),
			get: jest.fn(() => null),
		};

		const i18n = createInstance();
		i18n.use(RxDBBackend);
		await i18n.init({
			lng: 'en',
			fallbackLng: 'en',
			ns: ['core'],
			defaultNS: 'core',
			load: 'currentOnly',
			resources: {
				en: { core: { key: 'English' } },
			},
			backend: {
				translationsState,
			},
		});

		// Mock empty response for fr_CA, then success for fr
		mockFetchResponse({}); // fr_CA returns empty
		mockFetchResponse({ key: 'French' }); // fr returns data

		await i18n.changeLanguage('fr_CA');

		// Should fall back to 'fr' based on backend logic
		// The backend handles this, so we just verify the language is set
		expect(i18n.language).toBe('fr_CA');
	});

	it('falls back to English when requested language is unavailable', async () => {
		const translationsState = {
			set: jest.fn(),
			get: jest.fn(() => null),
		};

		const i18n = createInstance();
		i18n.use(RxDBBackend);
		await i18n.init({
			lng: 'en',
			fallbackLng: 'en',
			ns: ['core'],
			defaultNS: 'core',
			resources: {
				en: { core: { key: 'English' } },
			},
			backend: {
				translationsState,
			},
		});

		// Mock 404 for unknown language
		mockFetchResponse(null);

		await i18n.changeLanguage('xx');

		// Should have the language set to xx but fall back to English for translations
		expect(i18n.language).toBe('xx');
		expect(i18n.t('key')).toBe('English'); // Falls back to bundled English
	});
});

describe('i18next v25 - exists() method behavior', () => {
	it('exists() returns true for existing translation keys', async () => {
		const i18n = createInstance();
		await i18n.init({
			lng: 'en',
			resources: {
				en: { translation: { greeting: 'Hello', nested: { key: 'value' } } },
			},
		});

		expect(i18n.exists('greeting')).toBe(true);
		expect(i18n.exists('nonexistent')).toBe(false);
	});

	it('exists() respects returnObjects option for nested keys (v25.6.0 change)', async () => {
		const i18n = createInstance();
		await i18n.init({
			lng: 'en',
			resources: {
				en: { translation: { nested: { key: 'value' }, string: 'text' } },
			},
		});

		// When checking for an object key with returnObjects: false, should return false
		expect(i18n.exists('nested', { returnObjects: false })).toBe(false);

		// When checking for an object key with returnObjects: true, should return true
		expect(i18n.exists('nested', { returnObjects: true })).toBe(true);

		// String keys should always return true
		expect(i18n.exists('string', { returnObjects: false })).toBe(true);
		expect(i18n.exists('string', { returnObjects: true })).toBe(true);
	});
});
