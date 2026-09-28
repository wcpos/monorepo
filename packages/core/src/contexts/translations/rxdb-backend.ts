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

	private translationsState: any;
	private services: any;
	// A rolling ref is fetched once per backend instance; every later read for the same key
	// serves the cache, as a pinned version does.
	private fetchedRolling = new Set<string>();

	init(services: any, backendOptions: any) {
		this.services = services;
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

	/**
	 * Write the cache only when the fetched catalogue differs from what is stored. Every
	 * rx-state write appends the whole catalogue and wakes the app state's subscribers, and
	 * on a rolling ref an unconditional write on every read fed itself: the state grew by
	 * tens of megabytes a second until the browser's storage quota was exhausted.
	 */
	private cache(cacheKey: string, cached: unknown, data: Record<string, string>) {
		if (JSON.stringify(cached) === JSON.stringify(data)) return;
		this.translationsState?.set(cacheKey, () => data);
	}

	read(language: string, namespace: string, callback: (err: any, data?: any) => void) {
		const cacheKey = `${language}@${TRANSLATION_VERSION}`;

		// A pinned version serves the cache without fetching; a rolling ref serves it once
		// this instance has fetched the key.
		const cached = this.translationsState?.[cacheKey];
		const rolling = TRANSLATION_VERSION === ROLLING_TRANSLATION_REF;
		if (cached != null && (!rolling || this.fetchedRolling.has(cacheKey))) {
			callback(null, cached);
			return;
		}
		if (rolling) this.fetchedRolling.add(cacheKey);

		// Try the exact locale first, then fall back to base language (e.g. fr_CA -> fr)
		this.fetchTranslations(language, namespace)
			.then((data) => {
				if (data && Object.keys(data).length > 0) {
					this.cache(cacheKey, cached, data);
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
						this.cache(cacheKey, cached, fallbackData);
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
