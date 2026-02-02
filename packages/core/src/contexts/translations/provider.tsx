import * as React from 'react';

import i18next from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';

import { useLocale } from '../../hooks/use-locale';
import { useAppState } from '../app-state';

/**
 * Custom i18next backend plugin that reads from RxDB cache
 * and fetches updates from jsDelivr.
 */
class RxDBBackend {
	static type = 'backend' as const;
	type = 'backend' as const;

	private translationsState: any;
	private version: string;

	init(_services: any, backendOptions: any) {
		this.translationsState = backendOptions.translationsState;
		this.version = backendOptions.version || '0.0.0';
	}

	read(language: string, namespace: string, callback: (err: any, data?: any) => void) {
		// First try RxDB cache
		const cached = this.translationsState?.[language];
		if (cached) {
			callback(null, cached);
		} else {
			callback(null);
		}

		// Fetch from jsDelivr in background
		const url = `https://cdn.jsdelivr.net/gh/wcpos/translations@v${this.version}/translations/js/${language}/${namespace}.json`;
		fetch(url)
			.then((response) => {
				if (!response.ok) return;
				return response.json();
			})
			.then((data) => {
				if (data && Object.keys(data).length > 0) {
					// Persist to RxDB
					const current = this.translationsState?.[language];
					if (JSON.stringify(current) !== JSON.stringify(data)) {
						this.translationsState?.set(language, () => data);
					}
					// Update i18next resources
					i18next.addResourceBundle(language, namespace, data, true, true);
				}
			})
			.catch(() => {
				// Silently fail - we already returned cached data
			});
	}
}

/**
 * TranslationProvider initializes i18next and provides it to the app.
 *
 * - Loads cached translations from RxDB immediately
 * - Fetches updates from jsDelivr in background
 * - Persists updated translations back to RxDB
 * - Uses wcpos_version from the site document for the jsDelivr tag
 */
export const TranslationProvider = ({ children }: { children: React.ReactNode }) => {
	const { translationsState, site } = useAppState();
	const { locale } = useLocale();
	const wcposVersion = useObservableEagerState(site?.wcpos_version$ ?? of(''));

	const i18nInstance = React.useMemo(() => {
		const instance = i18next.createInstance();
		instance.use(initReactI18next).use(RxDBBackend).init({
			lng: locale,
			fallbackLng: false,
			ns: ['core'],
			defaultNS: 'core',
			keySeparator: false,
			nsSeparator: false,
			interpolation: {
				escapeValue: false,
				prefix: '{',
				suffix: '}',
			},
			backend: {
				translationsState,
				version: wcposVersion,
			},
		});
		return instance;
	}, [translationsState]);

	/**
	 * When the plugin version becomes available (after site info fetch),
	 * re-fetch translations with the correct version.
	 */
	React.useEffect(() => {
		if (wcposVersion && locale) {
			i18nInstance.reloadResources(locale, 'core');
		}
	}, [wcposVersion, i18nInstance]);

	/**
	 * Update language when locale changes
	 */
	React.useEffect(() => {
		if (i18nInstance.language !== locale) {
			i18nInstance.changeLanguage(locale);
		}
	}, [locale, i18nInstance]);

	return <I18nextProvider i18n={i18nInstance}>{children}</I18nextProvider>;
};
