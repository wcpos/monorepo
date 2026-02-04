export const TRANSLATION_VERSION = '2026.2.0';

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

	read(language: string, namespace: string, callback: (err: any, data?: any) => void) {
		// Return cached translations immediately if available
		const cached = this.translationsState?.[language];
		if (cached) {
			callback(null, cached);
		} else {
			callback(null);
		}

		// Fetch fresh translations from jsDelivr in the background
		const url = this.buildUrl(language, namespace);
		fetch(url)
			.then((response) => {
				if (!response.ok) return;
				return response.json();
			})
			.then((data) => {
				if (data && Object.keys(data).length > 0) {
					const current = this.translationsState?.[language];
					if (JSON.stringify(current) !== JSON.stringify(data)) {
						this.translationsState?.set(language, () => data);
					}
					this.services.resourceStore.addResourceBundle(language, namespace, data, true, true);
				}
			})
			.catch(() => {});
	}
}
