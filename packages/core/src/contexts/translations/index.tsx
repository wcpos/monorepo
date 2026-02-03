import * as React from 'react';

import i18next from 'i18next';
import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next';
import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';

import { useLocale } from '../../hooks/use-locale';
import { useAppState } from '../app-state';

/**
 * Custom i18next backend that loads translations from jsDelivr CDN
 * and caches them in RxDB via the app's translationsState.
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
		// Return cached translations immediately if available
		const cached = this.translationsState?.[language];
		if (cached) {
			callback(null, cached);
		} else {
			callback(null);
		}

		// Fetch fresh translations from jsDelivr in the background
		const url = `https://cdn.jsdelivr.net/gh/wcpos/translations@v${this.version}/translations/js/${language}/${namespace}.json`;
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
					i18next.addResourceBundle(language, namespace, data, true, true);
				}
			})
			.catch(() => {});
	}
}

export const TranslationProvider = ({ children }: { children: React.ReactNode }) => {
	const { translationsState, site } = useAppState();
	const { locale } = useLocale();
	const wcposVersion = useObservableEagerState(site?.wcpos_version$ ?? of(''));

	const i18nInstance = React.useMemo(() => {
		const instance = i18next.createInstance();
		instance
			.use(initReactI18next)
			.use(RxDBBackend)
			.init({
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
	 * When the WCPOS version becomes available (fetched via useSiteInfo),
	 * reload translations so the backend can fetch from the correct CDN URL.
	 */
	React.useEffect(() => {
		if (wcposVersion && locale) {
			i18nInstance.reloadResources(locale, 'core');
		}
	}, [wcposVersion, i18nInstance]);

	/**
	 * Handle locale changes.
	 */
	React.useEffect(() => {
		if (i18nInstance.language !== locale) {
			i18nInstance.changeLanguage(locale);
		}
	}, [locale, i18nInstance]);

	return <I18nextProvider i18n={i18nInstance}>{children}</I18nextProvider>;
};

export const useT = () => {
	const { t } = useTranslation();
	return t;
};
