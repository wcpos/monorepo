import * as React from 'react';

import { getLocales } from 'expo-localization';
import { getLogger } from '@wcpos/utils/logger';
import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';

import locales from './locales.json';
import { useAppState } from '../../contexts/app-state';

interface Language {
	/**
	 * Transifex locale code, eg: 'en_US', same as WordPress locale code
	 */
	locale: string;
	/**
	 * IETF language tag eg: 'en' or 'en-US'
	 */
	code: string;
	/**
	 * English name of the language
	 */
	name: string;
	/**
	 * Native name of the language
	 */
	nativeName: string;
}

interface LocalesType {
	[key: string]: Language;
}

/**
 * Convert system locales to our Transifex locales
 */
const log = getLogger(['wcpos', 'translations', 'locale']);
const systemLocales = getLocales();
const defaultLanguage: Language = {
	locale: 'en',
	code: 'en',
	name: 'English',
	nativeName: 'English',
};

const systemLanguage: Language = systemLocales?.[0]
	? (() => {
			const { languageCode, languageTag } = systemLocales[0];
			log.debug('[translations] System locale detection', { context: { languageCode, languageTag } });
			const matched =
				(locales as LocalesType)[languageTag.toLowerCase()] ||
				(languageCode && (locales as LocalesType)[languageCode]) ||
				defaultLanguage;
			log.debug('[translations] Matched system language', { context: { locale: matched.locale, name: matched.name } });
			return matched;
		})()
	: defaultLanguage;

/**
 *
 */
export const useLocale = () => {
	const { store } = useAppState();
	const locale$ = store?.locale$;

	/**
	 * Store may or may not be available
	 * - get the locale object from the store setting, or the system locale, or fallback to 'en'
	 */
	const storeLocale = useObservableEagerState<string | null | undefined>(locale$ || of(null));

	const language = React.useMemo(() => {
		log.debug('[translations] Computing language', { context: { storeLocale, systemLanguageLocale: systemLanguage.locale } });
		let lang: Language = systemLanguage;
		if (storeLocale) {
			const foundLang = Object.values(locales).find((l) => l.locale === storeLocale);
			log.debug('[translations] Store locale lookup', { context: { storeLocale, found: !!foundLang, foundLocale: foundLang?.locale } });
			if (foundLang) {
				lang = foundLang;
			}
		}
		log.debug('[translations] Resolved language', { context: { locale: lang.locale, name: lang.name } });
		return lang;
	}, [storeLocale]);

	return {
		...language,
		shortCode: language.code.split('-')[0], // eg: 'en' from 'en-US', region removed
		locales, // pass through locales for use in dropdown menus etc
	};
};
