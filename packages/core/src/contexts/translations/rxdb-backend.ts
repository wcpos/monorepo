/** Where the backend reads and writes catalogues, keyed `<language>@<version>`. */
interface TranslationCache {
	get(key: string): unknown;
	/** `cached` is the value read when the fetch started, so an unchanged catalogue is not rewritten. */
	set(key: string, catalogue: Record<string, string>, cached: unknown): void;
}

export interface RxDBBackendOptions {
	/** A wcpos/translations jsDelivr ref: a CalVer tag, or a branch such as `next`. */
	version: string;
	/** A rolling ref changes content under the same name, so it is re-fetched once per backend instance. */
	rolling: boolean;
	cache: TranslationCache;
}

/**
 * Custom i18next backend that loads translations from jsDelivr CDN
 * and caches them through the cache it is given.
 */
export class RxDBBackend {
	static type = 'backend' as const;
	type = 'backend' as const;

	private options!: RxDBBackendOptions;
	// A rolling ref is fetched once per backend instance; every later read for the same key
	// serves the cache, as a pinned version does.
	private fetchedRolling = new Set<string>();

	init(_services: unknown, backendOptions: RxDBBackendOptions) {
		this.options = backendOptions;
	}

	buildUrl(language: string, namespace: string): string {
		return `https://cdn.jsdelivr.net/gh/wcpos/translations@${this.options.version}/translations/js/${language}/monorepo/${namespace}.json`;
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
		const { version, rolling, cache } = this.options;
		const cacheKey = `${language}@${version}`;

		// A pinned version serves the cache without fetching; a rolling ref serves it once
		// this instance has fetched the key.
		const cached = cache.get(cacheKey);
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
					cache.set(cacheKey, data, cached);
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
						cache.set(cacheKey, fallbackData, cached);
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
