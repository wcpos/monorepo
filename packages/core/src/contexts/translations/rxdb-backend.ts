import { cacheTranslations, type TranslationsState, type UserDatabase } from '@wcpos/query/user-db';

// On next, this is wcpos/translations' moving jsDelivr branch ref, refreshed by the CDN within about 12 hours.
// On main, the release workflow replaces it with a CalVer tag; resolve this one-line conflict in main's favour when merging next.
export const TRANSLATION_VERSION = 'next';

// A rolling ref must be re-fetched because its content changes under the same name.
// (Named REF, not VERSION, so the release bump regex `TRANSLATION_VERSION = '…'` cannot match it.)
const ROLLING_TRANSLATION_REF = 'next';

/**
 * Custom i18next backend that loads translations from jsDelivr CDN
 * and caches them in RxDB via the app's translationsState.
 */
export class RxDBBackend {
	static type = 'backend' as const;
	type = 'backend' as const;

	private translationsState?: TranslationsState;
	private userDB?: UserDatabase;
	private services: any;
	// A rolling ref is fetched once per backend instance; every later read for the same key
	// serves the cache, as a pinned version does.
	private fetchedRolling = new Set<string>();

	init(services: any, backendOptions: any) {
		this.services = services;
		this.userDB = backendOptions.userDB;
		this.translationsState = backendOptions.translationsState;
	}

	buildUrl(language: string, namespace: string): string {
		return `https://cdn.jsdelivr.net/gh/wcpos/translations@${TRANSLATION_VERSION}/translations/js/${language}/monorepo/${namespace}.json`;
	}

	/**
	 * Extract the base language from a regional locale, e.g. 'fr_CA' -> 'fr'
	 */
	private getBaseLanguage(language: string): string | null {
		const parts = language.split('_');
		return parts.length > 1 ? parts[0].toLowerCase() : null;
	}

	private fetchTranslations(
		language: string,
		namespace: string
	): Promise<Record<string, string> | null> {
		const url = this.buildUrl(language, namespace);
		return fetch(url).then((response) => {
			if (!response.ok) return null;
			return response.json();
		});
	}

	read(language: string, namespace: string, callback: (err: any, data?: any) => void) {
		const cacheKey = `${language}@${TRANSLATION_VERSION}`;

		// A pinned version serves the cache without fetching; a rolling ref serves it once
		// this instance has fetched the key.
		const cached = this.translationsState?.get(cacheKey);
		const rolling = TRANSLATION_VERSION === ROLLING_TRANSLATION_REF;
		// The refreshed set is keyed by namespace too, so a second namespace would still be
		// fetched; the stored key stays language-only, as before this change.
		const refreshedKey = `${cacheKey}|${namespace}`;
		if (cached != null && (!rolling || this.fetchedRolling.has(refreshedKey))) {
			callback(null, cached);
			return;
		}
		// A failed refresh leaves the key unset, so a later read tries the CDN again.
		const refreshed = () => {
			if (rolling) this.fetchedRolling.add(refreshedKey);
		};

		// Try the exact locale first, then fall back to base language (e.g. fr_CA -> fr)
		this.fetchTranslations(language, namespace)
			.then((data) => {
				if (data && Object.keys(data).length > 0) {
					refreshed();
					if (this.userDB) void cacheTranslations(this.userDB, cacheKey, data, { cached });
					callback(null, data);
					return;
				}

				// Regional locale not found, try base language
				const baseLang = this.getBaseLanguage(language);
				if (!baseLang) {
					callback(null, cached ?? {});
					return;
				}

				return this.fetchTranslations(baseLang, namespace).then((fallbackData) => {
					if (fallbackData && Object.keys(fallbackData).length > 0) {
						// Cache under the original language + version key.
						refreshed();
						if (this.userDB)
							void cacheTranslations(this.userDB, cacheKey, fallbackData, { cached });
						callback(null, fallbackData);
					} else {
						callback(null, cached ?? {});
					}
				});
			})
			.catch(() => {
				callback(null, cached ?? {});
			});
	}
}
