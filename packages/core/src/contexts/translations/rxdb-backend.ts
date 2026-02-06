import { getLogger } from '@wcpos/utils/logger';

export const TRANSLATION_VERSION = '2026.2.2';

const log = getLogger(['wcpos', 'translations', 'backend']);

/**
 * Custom i18next backend that loads translations from jsDelivr CDN
 * and caches them in RxDB via the app's translationsState.
 */
export class RxDBBackend {
	static type = 'backend' as const;
	type = 'backend' as const;

	private translationsState: any;
	private services: any;

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

	read(language: string, namespace: string, callback: (err: any, data?: any) => void) {
		log.debug('[translations] read called', { context: { language, namespace } });

		// Return cached translations immediately if available
		const cached = this.translationsState?.[language];
		if (cached) {
			log.debug('[translations] Returning cached translations', { context: { language } });
			callback(null, cached);
			return;
		}

		// Try the exact locale first, then fall back to base language (e.g. fr_CA -> fr)
		const url = this.buildUrl(language, namespace);
		log.debug('[translations] Fetching translations', { context: { language, url } });

		this.fetchTranslations(language, namespace)
			.then((data) => {
				log.debug('[translations] Fetch result', { context: { language, keyCount: data ? Object.keys(data).length : 0 } });
				if (data && Object.keys(data).length > 0) {
					this.translationsState?.set(language, () => data);
					callback(null, data);
					return;
				}

				// Regional locale not found, try base language
				const baseLang = this.getBaseLanguage(language);
				if (!baseLang) {
					log.debug('[translations] No base language fallback available', { context: { language } });
					callback(null, {});
					return;
				}

				const fallbackUrl = this.buildUrl(baseLang, namespace);
				log.debug('[translations] Trying base language fallback', { context: { from: language, to: baseLang, url: fallbackUrl } });
				return this.fetchTranslations(baseLang, namespace).then((fallbackData) => {
					log.debug('[translations] Fallback result', { context: { baseLang, keyCount: fallbackData ? Object.keys(fallbackData).length : 0 } });
					if (fallbackData && Object.keys(fallbackData).length > 0) {
						// Cache under the original language key so we don't re-fetch
						this.translationsState?.set(language, () => fallbackData);
						callback(null, fallbackData);
					} else {
						callback(null, {});
					}
				});
			})
			.catch((err) => {
				log.error('[translations] Fetch failed', { context: { language, error: err?.message } });
				callback(null, {});
			});
	}
}
